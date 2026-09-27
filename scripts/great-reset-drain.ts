import "dotenv/config";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { agentRunCommandSchema, cancelAgentRun } from "@/modules/agents";
import { drainBlockers, runtimePausedBlockers } from "@/modules/maintenance/repository/great-reset";
import { resolveOperatorAdmin } from "./agent-operator";
import { assertResetOperatorTarget } from "./great-reset-operator-target";
import {
  prepareOperatorCliEnvironment,
  writeOperatorCliEnvironmentReport,
} from "./operator-cli-environment";

/*
  Great reset boşaltması (Astra ile ortak karar, 27 Eylül: "A+B"). Gerçek boyutlu provada reset
  önizlemesi gece yedeğindeki sıradaki/süren koşular ve aktif runtime state yüzünden bloklandı;
  A5 dondurması worker'ı durdurur ama kuyruğu ve runtime state'i bırakır.

  Sarmalayıcı bunu uzak bakım başlamadan ÖNCE, worker ve uygulama çalışırken koşar:
    1. Dört bayrak zaten kapalı olmalı (`agent-write-freeze.ts freeze <boşaltma-kaydı>`; reset'in
       kendi bayrak kaydından AYRI dosya — reset açılışı bayrakları otomatik açmaz).
    2. Sıradaki (QUEUED) BÜTÜN koşular, türden bağımsız, panelle aynı `cancelAgentRun` uygulama
       servisiyle tek tek iptal edilir (denetim kaydı). Süren koşular iptal edilmez; worker onları
       bitirip kirayı bırakır.
    3. Sınırlı süre (en çok 900 sn) yalnız okuyarak beklenir: reset önkoşuluyla AYNI sorgular
       (`runtimePausedBlockers`, `drainBlockers`) boş olmalı. Her turda yeni oluşmuş sıradaki
       koşular da iptal edilir (bayraklar kapalıyken elle kuyruğa ekleme yarışı).
    4. Süre dolarsa bakım başlamaz; bayraklar kapalı kalır, sahipsiz/takılı kayıtlar ayrı ve
       denetimli kurtarma ister. Açılış elle.

    AGENT_FLOW_REASON='great reset <op> boşaltma' tsx scripts/great-reset-drain.ts drain
    tsx scripts/great-reset-drain.ts status

  Çıktı yalnız sayılar ve güvenli kodlar basar.
*/

const commandSchema = z.enum(["status", "drain"]);
const environmentSchema = z
  .object({
    AGENT_OPERATOR_ADMIN_ID: z.string().uuid().optional(),
    AGENT_FLOW_REASON: z.string().min(1).max(200).optional(),
    AGENT_DRAIN_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(900).default(900),
    AGENT_DRAIN_POLL_SECONDS: z.coerce.number().int().min(1).max(30).default(5),
  })
  .passthrough();

export function drainFailureCode(error: unknown): string {
  if (error instanceof AppError) return error.code;
  if (error instanceof z.ZodError) return "DRAIN_INPUT_INVALID";
  if (error instanceof Error && /^DRAIN_[A-Z_]+$/u.test(error.message)) return error.message;
  if (error instanceof Error && /^GREAT_RESET_[A-Z_]+$/u.test(error.message)) return error.message;
  return "INTERNAL_ERROR";
}

async function main(): Promise<void> {
  const command = commandSchema.parse(process.argv[2]);
  writeOperatorCliEnvironmentReport(prepareOperatorCliEnvironment());
  const environment = environmentSchema.parse(process.env);
  const database = getDatabase();
  try {
    // Hedef kimliği ilk okumadan/mutasyondan önce, servislerin kullanacağı aynı istemciyle.
    await assertResetOperatorTarget(database);
    const status = async () => {
      const [paused, drained, queued, active] = await database.$transaction(async (tx) => [
        await runtimePausedBlockers(tx),
        await drainBlockers(tx),
        await tx.agentRun.count({ where: { runStatus: "QUEUED" } }),
        await tx.agentRun.count({ where: { runStatus: { in: ["RUNNING", "CANCEL_REQUESTED"] } } }),
      ]);
      return { blockers: [...paused, ...drained], paused: paused.length === 0, queued, active };
    };
    const report = (state: Awaited<ReturnType<typeof status>>, cancelled: number) =>
      process.stdout.write(
        `RESET_DRAIN command=${command} ready=${state.blockers.length === 0} ` +
          `blockers=${state.blockers.join(",") || "-"} queued=${state.queued} ` +
          `active=${state.active} cancelled=${cancelled}\n`,
      );
    if (command === "status") {
      const state = await status();
      report(state, 0);
      if (state.blockers.length) process.exitCode = 3;
      return;
    }
    const reason = agentRunCommandSchema.parse({ reason: environment.AGENT_FLOW_REASON });
    const actor = {
      ...(await resolveOperatorAdmin(database, environment.AGENT_OPERATOR_ADMIN_ID)),
      requestId: randomUUID(),
    };
    if (!(await status()).paused) throw new Error("DRAIN_FLAGS_NOT_FROZEN");
    const deadline = Date.now() + environment.AGENT_DRAIN_TIMEOUT_SECONDS * 1000;
    let cancelled = 0;
    for (;;) {
      const queued = await database.agentRun.findMany({
        where: { runStatus: "QUEUED" },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      for (const { id } of queued) {
        // Süre sınırı iptaller arasında da geçerli (Astra #243 P2).
        if (Date.now() >= deadline) throw new Error("DRAIN_TIMEOUT");
        try {
          // Yalnız kilit altında hâlâ sıradaysa: arada worker almışsa süren koşuya dokunulmaz.
          await cancelAgentRun(database, actor, id, reason, { requireQueued: true });
          cancelled += 1;
        } catch (error) {
          // Arada durumu değişen koşu (worker aldı ya da bitti) sonraki turda yeniden değerlendirilir.
          if (!(error instanceof AppError && error.code === "AGENT_RUN_LEASE_INVALID")) throw error;
        }
      }
      const state = await status();
      if (!state.paused) {
        report(state, cancelled);
        throw new Error("DRAIN_FLAGS_REOPENED");
      }
      // Süre sınırı başarıdan ÖNCE: sınır aşıldıktan sonra görülen hazır durum kabul edilmez.
      if (Date.now() >= deadline) {
        report(state, cancelled);
        throw new Error("DRAIN_TIMEOUT");
      }
      if (state.blockers.length === 0) {
        report(state, cancelled);
        return;
      }
      await sleep(environment.AGENT_DRAIN_POLL_SECONDS * 1000);
    }
  } finally {
    await database.$disconnect();
  }
}

if (process.argv[1]?.endsWith("great-reset-drain.ts")) {
  main().catch((error: unknown) => {
    process.stderr.write(`RESET_DRAIN_FAIL code=${drainFailureCode(error)}\n`);
    process.exitCode = 3;
  });
}
