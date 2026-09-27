import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import {
  globalSettingsUpdateSchema,
  runtimeControlSchema,
  setGlobalRuntimeEnabledIfChanged,
  updateGlobalSettings,
} from "@/modules/agents";
import { resolveOperatorAdmin } from "./agent-operator";
import { operatorFailureCode } from "./agent-society-flow";
import { writeNewDurable } from "./great-reset-durable-file";
import {
  prepareOperatorCliEnvironment,
  writeOperatorCliEnvironmentReport,
} from "./operator-cli-environment";
import { assertResetOperatorTarget } from "./great-reset-operator-target";

/*
  Great reset yazma dondurması (tasarım v20, runbook "A5 reset modu" 1. ve 10. adım). Reset
  önkoşulu dört global bayrağın (`runtimeEnabled`, `schedulerEnabled`, `publicWriteEnabled`,
  `publishEnabled`) kapalı olmasıdır. Bayraklar panelle aynı uygulama servisleriyle, denetim kaydı
  ve güncel ayar sürümüyle değiştirilir; doğrudan SQL yoktur.

    AGENT_FLOW_REASON='great reset <op>' tsx scripts/agent-write-freeze.ts freeze <durum.json>
    AGENT_FLOW_REASON='great reset <op> açılış' tsx scripts/agent-write-freeze.ts restore <durum.json>

  `freeze` önceki değerleri durum dosyasına (0600, üzerine yazmadan) BİR KEZ yazar; yeniden girişte
  dosya varsa onu okur ve yalnız kapalılığı sağlar. `restore` her bayrağı o dosyadaki değerine
  ayrı ayrı döndürür. Çıktı sır basmaz.
*/

const stateSchema = z
  .object({
    version: z.literal(1),
    runtimeEnabled: z.boolean(),
    schedulerEnabled: z.boolean(),
    publicWriteEnabled: z.boolean(),
    publishEnabled: z.boolean(),
    settingsVersion: z.number().int().positive(),
  })
  .strict();
type FreezeState = z.infer<typeof stateSchema>;

const environmentSchema = z
  .object({
    AGENT_OPERATOR_ADMIN_ID: z.string().uuid().optional(),
    AGENT_FLOW_REASON: z.string().min(1).max(200),
  })
  .passthrough();

function readState(path: string): FreezeState | null {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return stateSchema.parse(JSON.parse(text));
}

async function main(): Promise<void> {
  const [command, path] = process.argv.slice(2);
  if ((command !== "freeze" && command !== "restore") || !path || !isAbsolute(path))
    throw new z.ZodError([]);
  writeOperatorCliEnvironmentReport(prepareOperatorCliEnvironment());
  const environment = environmentSchema.parse(process.env);
  const database = getDatabase();
  try {
    // Hedef kimliği ilk mutasyondan önce (Astra #243 P1): restore kopyası ya da başka küme değil.
    await assertResetOperatorTarget(database);
    const actor = {
      ...(await resolveOperatorAdmin(database, environment.AGENT_OPERATOR_ADMIN_ID)),
      requestId: randomUUID(),
    };
    const read = () =>
      database.agentGlobalSettings.findUniqueOrThrow({
        where: { id: "global" },
        select: {
          runtimeEnabled: true,
          schedulerEnabled: true,
          publicWriteEnabled: true,
          publishEnabled: true,
          settingsVersion: true,
        },
      });
    let target: Omit<FreezeState, "version" | "settingsVersion">;
    if (command === "freeze") {
      if (!readState(path)) {
        const current = await read();
        writeNewDurable(path, `${JSON.stringify({ version: 1, ...current })}\n`);
      }
      target = {
        runtimeEnabled: false,
        schedulerEnabled: false,
        publicWriteEnabled: false,
        publishEnabled: false,
      };
    } else {
      const saved = readState(path);
      if (!saved) throw new Error("WRITE_FREEZE_STATE_MISSING");
      target = saved;
    }
    const reason = runtimeControlSchema.parse({ reason: environment.AGENT_FLOW_REASON });
    await setGlobalRuntimeEnabledIfChanged(database, actor, target.runtimeEnabled, reason);
    const current = await read();
    await updateGlobalSettings(
      database,
      actor,
      globalSettingsUpdateSchema.parse({
        expectedSettingsVersion: current.settingsVersion,
        changeReason: environment.AGENT_FLOW_REASON,
        schedulerEnabled: target.schedulerEnabled,
        publicWriteEnabled: target.publicWriteEnabled,
        publishEnabled: target.publishEnabled,
      }),
    );
    const after = await read();
    const matches =
      after.runtimeEnabled === target.runtimeEnabled &&
      after.schedulerEnabled === target.schedulerEnabled &&
      after.publicWriteEnabled === target.publicWriteEnabled &&
      after.publishEnabled === target.publishEnabled;
    process.stdout.write(
      `WRITE_FREEZE command=${command} runtime=${after.runtimeEnabled} scheduler=${after.schedulerEnabled} ` +
        `publicWrite=${after.publicWriteEnabled} publish=${after.publishEnabled} ` +
        `settingsVersion=${after.settingsVersion}\n`,
    );
    if (!matches) process.exitCode = 1;
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  const code =
    error instanceof Error &&
    (error.message === "WRITE_FREEZE_STATE_MISSING" || /^GREAT_RESET_[A-Z_]+$/u.test(error.message))
      ? error.message
      : operatorFailureCode(error);
  process.stderr.write(`WRITE_FREEZE_FAIL code=${code}\n`);
  process.exitCode = 1;
});
