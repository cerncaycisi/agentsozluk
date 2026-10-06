import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname } from "node:path";
import { hostname } from "node:os";
import { z } from "zod";
import {
  appendResetGeneration,
  initializeResetGenerationStore,
  requirePreResetRestoreGeneration,
} from "./reset-generation-store";
import { resetGenerationMirrorFromStore } from "./reset-generation-mirror";

const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const binding = z
  .object({
    operationId: z.string().uuid(),
    releaseSha: z.string().regex(/^[a-f0-9]{40}$/u),
    dumpSha256: hash,
    manifestSha256: hash,
    planSha256: hash,
    implementationSha256: hash,
    backupClass: z.literal("PRE_RESET_BIGINT"),
  })
  .strict();
const event = binding
  .extend({
    state: z.enum(["PREPARED", "COMMITTED_MAINTENANCE", "TRAFFIC_OPEN", "ROLLED_BACK", "ABORTED"]),
    protectedSha256: hash.optional(),
    restoredDatabaseOid: z
      .string()
      .regex(/^[1-9][0-9]*$/u)
      .optional(),
    clearedCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
  })
  .strict();
const request = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("APPEND"), expectedPreviousHmac: hash.nullable(), event }).strict(),
  z.object({ mode: z.literal("CHECK_PRE_RESET_RESTORE"), binding }).strict(),
  z.object({ mode: z.literal("MIRROR") }).strict(),
]);
function privateInput(path: string): unknown {
  const s = lstatSync(path);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.uid !== process.getuid?.() ||
    (s.mode & 0o777) !== 0o600 ||
    s.size > 65536 ||
    realpathSync(path) !== path
  )
    throw new Error("GREAT_RESET_GENERATION_PRIVATE_FILE_REQUIRED");
  return JSON.parse(readFileSync(path, "utf8"));
}
async function main() {
  const args = process.argv.slice(2);
  if (hostname() !== "agentic-server")
    throw new Error("GREAT_RESET_GENERATION_OPERATOR_HOST_REQUIRED");
  if (
    args.length !== 4 ||
    args[0] !== "--store" ||
    args[2] !== "--request" ||
    !/^\/home\/agent\/style-lab\/(?:[a-zA-Z0-9_-]+\/)+generation$/u.test(args[1] ?? "")
  )
    throw new Error("GREAT_RESET_GENERATION_ARGUMENTS_INVALID");
  const directory = args[1]!;
  const inputPath = args[3]!;
  if (realpathSync(dirname(directory)) !== dirname(directory))
    throw new Error("GREAT_RESET_GENERATION_PRIVATE_PATH_REQUIRED");
  if (inputPath === "INIT") {
    await initializeResetGenerationStore(directory);
    process.stdout.write(
      JSON.stringify({ event: "GREAT_RESET_GENERATION_STORE_INITIALIZED" }) + "\n",
    );
    return;
  }
  const value = request.parse(privateInput(inputPath));
  if (value.mode === "APPEND") {
    const { protectedSha256, clearedCounts, restoredDatabaseOid, ...requiredEvent } = value.event;
    const proof = await appendResetGeneration(directory, value.expectedPreviousHmac, {
      ...requiredEvent,
      ...(protectedSha256 === undefined ? {} : { protectedSha256 }),
      ...(clearedCounts === undefined ? {} : { clearedCounts }),
      ...(restoredDatabaseOid === undefined ? {} : { restoredDatabaseOid }),
    });
    process.stdout.write(
      JSON.stringify({
        event: "GREAT_RESET_GENERATION_EVENT_APPENDED",
        state: proof.event.state,
        operationId: proof.event.operationId,
        hmac: proof.event.hmac,
        journalSha256: proof.journalSha256,
      }) + "\n",
    );
    return;
  }
  if (value.mode === "CHECK_PRE_RESET_RESTORE") {
    const current = requirePreResetRestoreGeneration(directory, value.binding);
    process.stdout.write(
      JSON.stringify({
        event: "GREAT_RESET_GENERATION_RESTORE_ADMITTED",
        operationId: current.operationId,
        state: current.state,
      }) + "\n",
    );
    return;
  }
  const mirror = resetGenerationMirrorFromStore(directory, {
    databaseName: "agent_sozluk",
    databaseOid: "16385",
    clusterId: "7663503447447879713",
  });
  // Karşılaştırma/publish zarfı bu çıktıyı taşır; gizli key veya dump satırı yok.
  process.stdout.write(JSON.stringify(mirror) + "\n");
}
main().catch((error: unknown) => {
  const code =
    error instanceof Error && /^GREAT_RESET_[A-Z_]+$/u.test(error.message)
      ? error.message
      : "GREAT_RESET_GENERATION_OPERATION_FAILED";
  process.stderr.write(code + "\n");
  process.exitCode = 1;
});
