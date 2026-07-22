import { z } from "zod";

async function main(): Promise<void> {
  const mode = z.enum(["today", "regenerate"]).parse(process.argv[2]);
  throw new Error(
    `AGENT_DAILY_PLANNING_RETIRED: ${mode} komutu kaldırıldı; otomatik public akış stochastic toplum tick'i ile yürür.`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Agent planı oluşturulamadı."}\n`,
  );
  process.exitCode = 1;
});
