import { hostname } from "node:os";
import { localResetTarget, parseLocalResetArguments } from "./great-reset-local-guard";

async function main(): Promise<void> {
  const request = parseLocalResetArguments(process.argv.slice(2));
  const target = localResetTarget(process.env.AGENT_GREAT_RESET_DATABASE_URL, hostname());
  if (request.mode === "EXECUTE" && request.databaseName !== target.databaseName) {
    throw new Error("GREAT_RESET_CONFIRMATION_MISMATCH");
  }
  // .env ve genel DATABASE_URL yüklenmez. Geçersiz hedefte DB modülü bile açılmaz.
  const { runLocalGreatReset } = await import("../src/modules/maintenance/repository/great-reset");
  const result = await runLocalGreatReset(process.env.AGENT_GREAT_RESET_DATABASE_URL, request);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

void main().catch((error: unknown) => {
  const code =
    error instanceof Error && /^GREAT_RESET_[A-Z_]+$/u.test(error.message)
      ? error.message
      : "GREAT_RESET_DATABASE_OPERATION_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
