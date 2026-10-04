import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { compareBackupRestore } from "./backup-restore/receipt";

try {
  const [metadata, restored, ...extra] = process.argv.slice(2);
  if (!metadata || !restored || extra.length) throw new Error("O3_ARGUMENTS_INVALID");
  const sourceBytes = readFileSync(metadata);
  const restoredBytes = readFileSync(restored);
  const result = compareBackupRestore(sourceBytes.toString("utf8"), restoredBytes.toString("utf8"));
  const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  process.stdout.write(
    `${JSON.stringify({
      ...result,
      metadataSha256: sha256(sourceBytes),
      restoredSha256: sha256(restoredBytes),
    })}\n`,
  );
} catch (error) {
  const code =
    error instanceof Error && /^O3_[A-Z_]+$/u.test(error.message)
      ? error.message
      : "O3_INPUT_UNREADABLE";
  console.error(code);
  process.exitCode = 1;
}
