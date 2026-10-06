import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { getDatabase } from "../src/lib/db/client";
import { resetGenerationMirrorSchema } from "../src/modules/maintenance/domain/reset-generation-admission";
import { requireResetGenerationAdmission } from "../src/modules/maintenance/repository/reset-generation-admission";
import {
  resetGenerationLatchSchema,
  resetGenerationLatchFromMirror,
} from "./reset-generation-mirror";

function rootJson(file: string): unknown | null {
  try {
    const s = lstatSync(file);
    if (
      !s.isFile() ||
      s.isSymbolicLink() ||
      s.uid !== 0 ||
      s.mode & 0o022 ||
      s.size > 65536 ||
      realpathSync(file) !== file
    )
      throw new Error("GREAT_RESET_GENERATION_MIRROR_INVALID");
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  const file = "/run/agentsozluk-reset/current.json";
  const value = rootJson(file);
  const mirror = value === null ? null : resetGenerationMirrorSchema.parse(value);
  const latchValue = rootJson("/run/agentsozluk-reset/required.json");
  if (latchValue !== null) {
    const required = resetGenerationLatchSchema.parse(latchValue);
    if (
      !mirror ||
      JSON.stringify(resetGenerationLatchFromMirror(mirror)) !== JSON.stringify(required)
    )
      throw new Error("GREAT_RESET_GENERATION_BINDING_MISMATCH");
  }
  const db = getDatabase();
  try {
    await db.$transaction(
      (tx) =>
        requireResetGenerationAdmission(
          tx,
          mirror,
          latchValue !== null || process.env.AGENT_SOZLUK_RESET_GENERATION_REQUIRED === "true",
        ),
      { isolationLevel: "RepeatableRead", timeout: 30000, maxWait: 5000 },
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  process.stderr.write("GREAT_RESET_GENERATION_ADMISSION_REJECTED\n");
  process.exitCode = 1;
});
