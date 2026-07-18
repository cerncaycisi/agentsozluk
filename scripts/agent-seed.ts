import "dotenv/config";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { createAgent, createAgentSchema } from "@/modules/agents";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { resolveOperatorAdmin } from "./agent-operator";

const environmentSchema = z
  .object({
    AGENT_OPERATOR_ADMIN_ID: z.string().uuid().optional(),
    AGENT_RUNTIME_CREDENTIAL_OUTPUT: z.string().min(1),
    AGENT_SEED_CONFIRMATION: z.literal("SEED_TEN_PAUSED_AGENTS"),
  })
  .passthrough();

async function main(): Promise<void> {
  const environment = environmentSchema.parse(process.env);
  const database = getDatabase();
  try {
    if (originalPersonaPack.personas.length !== 10)
      throw new Error("Canonical persona paketi tam olarak 10 persona içermelidir.");
    const usernames = originalPersonaPack.personas.map(({ username }) => username);
    const existing = await database.agentProfile.findMany({
      where: { user: { username: { in: usernames } } },
      select: { user: { select: { username: true } } },
    });
    if (existing.length === 10) {
      process.stdout.write("Canonical 10 agent zaten mevcut; credential üretilmedi.\n");
      return;
    }
    if (existing.length > 0)
      throw new Error(
        `Kısmi canonical agent seti bulundu (${existing.length}/10); seed durduruldu, önce operatör incelemesi gerekir.`,
      );
    const actor = await resolveOperatorAdmin(database, environment.AGENT_OPERATOR_ADMIN_ID);
    const credentials = await database.$transaction(
      async (transaction) => {
        const issued: string[] = [];
        for (const persona of originalPersonaPack.personas) {
          const created = await createAgent(
            transaction,
            { ...actor, requestId: randomUUID() },
            createAgentSchema.parse({ persona, lifecycleStatus: "PAUSED" }),
          );
          issued.push(created.credential);
        }
        return issued;
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
    await writeFile(
      environment.AGENT_RUNTIME_CREDENTIAL_OUTPUT,
      `${JSON.stringify({ credentials }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    process.stdout.write(
      "10 canonical agent PAUSED oluşturuldu; credential dosyası 0600 yazıldı.\n",
    );
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Agent seed başarısız."}\n`);
  process.exitCode = 1;
});
