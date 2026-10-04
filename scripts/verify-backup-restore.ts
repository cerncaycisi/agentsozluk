import { readFileSync } from "node:fs";
import { compareBackupRestore } from "./backup-restore/receipt";

try {
  const [metadata, restored, ...extra] = process.argv.slice(2);
  if (!metadata || !restored || extra.length) throw new Error("O3_ARGUMENTS_INVALID");
  const result = compareBackupRestore(
    readFileSync(metadata, "utf8"),
    readFileSync(restored, "utf8"),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const code =
    error instanceof Error && /^O3_[A-Z_]+$/u.test(error.message)
      ? error.message
      : "O3_INPUT_UNREADABLE";
  console.error(code);
  process.exitCode = 1;
}
