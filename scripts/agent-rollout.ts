import { z } from "zod";
import { constants, type BigIntStats } from "node:fs";
import { lstat, open, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  productionRolloutCommandSchema,
  productionRolloutStartSchema,
} from "@/modules/agents/validation/schemas";
import { productionRolloutCheckpointSchema } from "@/modules/agents/validation/production-rollout-schemas";

const environmentSchema = z
  .object({
    AGENT_OPERATOR_ENV_FILE: z.string().min(1).optional(),
    AGENT_OPERATOR_ADMIN_ID: z.string().uuid().optional(),
    AGENT_DB_IP: z.string().min(1).optional(),
    AGENT_ROLLOUT_ATTEMPT_ID: z.string().uuid(),
    AGENT_ROLLOUT_COMMAND_ID: z.string().uuid(),
    AGENT_ROLLOUT_REASON_CODE: z.enum(["DAY0_START", "DAY0_ABORT", "DAY0_COMPLETE"]).optional(),
    AGENT_ROLLOUT_EVIDENCE_FILE: z.string().min(1).optional(),
  })
  .passthrough();

export const MAX_ROLLOUT_EVIDENCE_BYTES = 64 * 1024;

type StableFileStat = BigIntStats;

function isSecureEvidenceFile(stat: StableFileStat): boolean {
  return stat.isFile() && (stat.mode & 0o777n) === 0o600n && stat.nlink === 1n;
}

function isSameEvidenceFile(left: StableFileStat, right: StableFileStat): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function filesystemErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = Reflect.get(error, "code");
  return typeof code === "string" && /^[A-Z0-9_]+$/.test(code) ? code : null;
}

export async function readRolloutEvidenceFile(filePath: string): Promise<Record<string, unknown>> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await handle.stat({ bigint: true });
    if (!isSecureEvidenceFile(before))
      throw new Error("Rollout evidence file must be a mode-0600 single-link regular file.");
    if (before.size > BigInt(MAX_ROLLOUT_EVIDENCE_BYTES))
      throw new Error(`Rollout evidence file exceeds ${MAX_ROLLOUT_EVIDENCE_BYTES} bytes.`);

    const buffer = Buffer.alloc(MAX_ROLLOUT_EVIDENCE_BYTES + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > MAX_ROLLOUT_EVIDENCE_BYTES)
      throw new Error(`Rollout evidence file exceeds ${MAX_ROLLOUT_EVIDENCE_BYTES} bytes.`);

    const after = await handle.stat({ bigint: true });
    if (!isSecureEvidenceFile(after) || !isSameEvidenceFile(before, after))
      throw new Error("Rollout evidence file changed while it was being read.");

    const pathAfter = await lstat(filePath, { bigint: true });
    if (!isSecureEvidenceFile(pathAfter) || !isSameEvidenceFile(after, pathAfter))
      throw new Error("Rollout evidence file path changed while it was being read.");

    let parsedEvidence: unknown;
    try {
      parsedEvidence = JSON.parse(buffer.subarray(0, offset).toString("utf8"));
    } catch {
      throw new Error("Rollout evidence file must contain valid JSON.");
    }
    if (!parsedEvidence || typeof parsedEvidence !== "object" || Array.isArray(parsedEvidence))
      throw new Error("Rollout evidence file must contain one JSON object.");
    return parsedEvidence as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Rollout evidence file")) throw error;
    const code = filesystemErrorCode(error);
    throw new Error(`Rollout evidence file could not be read securely${code ? ` (${code})` : ""}.`);
  } finally {
    await handle?.close();
  }
}

async function main(): Promise<void> {
  const mode = z
    .enum([
      "start",
      "gate9",
      "gate10-start",
      "gate10-sample",
      "gate10-accept",
      "gate11-start",
      "gate11-accept",
      "gate12-pre",
      "gate12-post",
      "gate12-accept",
      "abort",
      "complete",
    ])
    .parse(process.argv[2]);
  if (process.env.AGENT_OPERATOR_ENV_FILE) process.loadEnvFile(process.env.AGENT_OPERATOR_ENV_FILE);
  if (process.env.AGENT_DB_IP && process.env.DATABASE_URL) {
    const databaseUrl = new URL(process.env.DATABASE_URL);
    databaseUrl.hostname = process.env.AGENT_DB_IP;
    process.env.DATABASE_URL = databaseUrl.toString();
  }
  const environment = environmentSchema.parse(process.env);
  const [{ getDatabase }, agents, { resolveOperatorAdmin }] = await Promise.all([
    import("@/lib/db/client"),
    import("@/modules/agents"),
    import("./agent-operator"),
  ]);
  const database = getDatabase();
  try {
    const actor = await resolveOperatorAdmin(database, environment.AGENT_OPERATOR_ADMIN_ID);
    const identifiers = {
      attemptId: environment.AGENT_ROLLOUT_ATTEMPT_ID,
      commandId: environment.AGENT_ROLLOUT_COMMAND_ID,
    };
    let result;
    if (mode === "start") {
      result = await agents.startProductionRolloutAttempt(
        database,
        actor,
        productionRolloutStartSchema.parse({
          ...identifiers,
          reasonCode: environment.AGENT_ROLLOUT_REASON_CODE,
        }),
      );
    } else if (mode === "abort" || mode === "complete") {
      const input = productionRolloutCommandSchema.parse({
        ...identifiers,
        reasonCode: environment.AGENT_ROLLOUT_REASON_CODE,
      });
      result =
        mode === "abort"
          ? await agents.abortProductionRolloutAttempt(database, actor, input)
          : await agents.completeProductionRolloutAttempt(database, actor, input);
    } else {
      if (!environment.AGENT_ROLLOUT_EVIDENCE_FILE)
        throw new Error("Checkpoint command requires AGENT_ROLLOUT_EVIDENCE_FILE.");
      const parsedEvidence = await readRolloutEvidenceFile(environment.AGENT_ROLLOUT_EVIDENCE_FILE);
      const kind = {
        gate9: "GATE9_ACCEPTED",
        "gate10-start": "GATE10_STARTED",
        "gate10-sample": "GATE10_SAMPLED",
        "gate10-accept": "GATE10_ACCEPTED",
        "gate11-start": "GATE11_STARTED",
        "gate11-accept": "GATE11_ACCEPTED",
        "gate12-pre": "GATE12_PRE_REBOOT",
        "gate12-post": "GATE12_POST_REBOOT",
        "gate12-accept": "GATE12_ACCEPTED",
      }[mode];
      const input = productionRolloutCheckpointSchema.parse({
        ...parsedEvidence,
        ...identifiers,
        kind,
      });
      result = await agents.recordProductionRolloutCheckpoint(database, actor, input);
    }
    process.stdout.write(`${JSON.stringify({ mode, ...result })}\n`);
  } finally {
    await database.$disconnect();
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href)
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Production rollout command failed."}\n`,
    );
    process.exitCode = 1;
  });
