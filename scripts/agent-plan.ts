import "dotenv/config";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { generateAgentDailyPlans, istanbulLocalDate } from "@/modules/agents";
import { resolveOperatorAdmin } from "./agent-operator";

const environmentSchema = z
  .object({ AGENT_OPERATOR_ADMIN_ID: z.string().uuid().optional() })
  .passthrough();

async function main(): Promise<void> {
  const mode = z.enum(["today", "regenerate"]).parse(process.argv[2]);
  const environment = environmentSchema.parse(process.env);
  const database = getDatabase();
  try {
    const actor = await resolveOperatorAdmin(database, environment.AGENT_OPERATOR_ADMIN_ID);
    const localDate = istanbulLocalDate(new Date());
    const result = await generateAgentDailyPlans(database, actor, { localDate });
    process.stdout.write(
      `${JSON.stringify({
        mode,
        localDate: localDate.toISOString().slice(0, 10),
        createdPlans: result.createdPlans,
        existingPlans: result.existingPlans,
        capacityStatus: result.capacity?.capacityStatus ?? "UNCHANGED",
      })}\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Agent planı oluşturulamadı."}\n`,
  );
  process.exitCode = 1;
});
