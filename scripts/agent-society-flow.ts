import "dotenv/config";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { runtimeControlSchema, setGlobalRuntimeEnabledIfChanged } from "@/modules/agents";
import { resolveOperatorAdmin } from "./agent-operator";
import {
  prepareOperatorCliEnvironment,
  writeOperatorCliEnvironmentReport,
} from "./operator-cli-environment";

/*
  Genel runtime'ı (toplum akışı) operatör olarak duraklatır/devam ettirir.
  Uygulama servisi `setGlobalRuntimeEnabledIfChanged`: yalnız `runtimeEnabled`
  değişir (panelin "Global runtime pause/resume" komutuyla aynı alan, denetim kaydı
  ve runtime olayı); zamanlayıcı, yayın, mod ELLENMEZ — `resume` yalnız `pause`un
  kapattığını geri açar (Astra, #186). Aktör sunucudaki tek aktif HUMAN ADMIN
  (`resolveOperatorAdmin`, ya da AGENT_OPERATOR_ADMIN_ID).

  Neden var: migration'sız dağıtım runbook gereği ÖNCE genel duraklatma ister;
  bu yalnız panelden yapılabiliyordu ve dağıtım o yüzden takıldı (24 Eylül).

  İdempotent ve kilit altında: istenen durum zaten geçerliyse HİÇBİR ŞEY yazmaz,
  ayar sürümü değişmez; eşzamanlı ikinci çağrı da yazmaz. Çıktı sır basmaz.

    tsx scripts/agent-society-flow.ts status
    AGENT_FLOW_REASON='deploy <sha12>' tsx scripts/agent-society-flow.ts pause
    AGENT_FLOW_REASON='deploy <sha12> kabul' tsx scripts/agent-society-flow.ts resume
*/

export type FlowCommand = "status" | "pause" | "resume";

const commandSchema = z.enum(["status", "pause", "resume"]);
const environmentSchema = z
  .object({
    AGENT_OPERATOR_ADMIN_ID: z.string().uuid().optional(),
    AGENT_FLOW_REASON: z.string().min(1).max(200).optional(),
  })
  .passthrough();

async function main(): Promise<void> {
  const command = commandSchema.parse(process.argv[2]);
  writeOperatorCliEnvironmentReport(prepareOperatorCliEnvironment());
  const environment = environmentSchema.parse(process.env);
  const database = getDatabase();
  try {
    const read = async () => {
      const settings = await database.agentGlobalSettings.findUniqueOrThrow({
        where: { id: "global" },
        select: { runtimeEnabled: true, settingsVersion: true },
      });
      const [running, queued] = await Promise.all([
        database.agentRun.count({ where: { runStatus: "RUNNING" } }),
        database.agentRun.count({ where: { runStatus: "QUEUED" } }),
      ]);
      return { ...settings, running, queued };
    };
    let changed = false;
    if (command !== "status") {
      const input = runtimeControlSchema.parse({ reason: environment.AGENT_FLOW_REASON });
      const actor = {
        ...(await resolveOperatorAdmin(database, environment.AGENT_OPERATOR_ADMIN_ID)),
        requestId: randomUUID(),
      };
      const result = await setGlobalRuntimeEnabledIfChanged(
        database,
        actor,
        command === "resume",
        input,
      );
      changed = result.changed;
    }
    const after = await read();
    process.stdout.write(
      `SOCIETY_FLOW command=${command} changed=${changed} runtimeEnabled=${after.runtimeEnabled} ` +
        `settingsVersion=${after.settingsVersion} running=${after.running} queued=${after.queued}\n`,
    );
    if (command === "pause" && after.runtimeEnabled) process.exitCode = 1;
    if (command === "resume" && !after.runtimeEnabled) process.exitCode = 1;
  } finally {
    await database.$disconnect();
  }
}

if (process.argv[1]?.endsWith("agent-society-flow.ts")) {
  main().catch((error: unknown) => {
    // Yalnız güvenli kod; logger (pino) runtime release'inde yok.
    const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
    process.stderr.write(`SOCIETY_FLOW_FAIL code=${code}\n`);
    process.exitCode = 1;
  });
}
