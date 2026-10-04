import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseRuntimeDecisionOutput } from "../../src/runtime/output";
import {
  RuntimeProviderCancelledError,
  RuntimeProviderExecutionError,
  RuntimeProviderTimeoutError,
  type RuntimeProvider,
} from "../../src/runtime/provider";
import { atomicPrivateJson, hash, privateDirectory, readPrivate } from "./files";
import type { PreparedPilot } from "./input";

const attemptSchema = z
  .object({
    index: z.number().int().min(1).max(24),
    kind: z.enum(["DECISION", "READER"]),
    label: z.string(),
    status: z.enum(["RESERVED", "VALID_OUTPUT", "FAILED"]),
    reservedAt: z.number().finite(),
    finishedAt: z.number().finite().optional(),
    safeCode: z
      .string()
      .regex(/^[A-Z0-9_]+$/u)
      .optional(),
    outputHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
  })
  .strict();
const stateSchema = z
  .object({
    version: z.literal(1),
    study: z.literal("P345_2026_10"),
    fingerprint: z.string(),
    startedAt: z.number().finite().nullable(),
    lastObservedAt: z.number().finite(),
    attempts: z.array(attemptSchema).max(24),
    terminalReason: z
      .string()
      .regex(/^[A-Z0-9_]+$/u)
      .optional(),
  })
  .strict();
type State = z.infer<typeof stateSchema>;
type Attempt = z.infer<typeof attemptSchema>;
export interface PilotReader {
  invoke(packet: string, timeoutMs: number): Promise<{ model: "claude-opus-5"; report: string }>;
}
const retryableCodes = new Set([
  "CODEX_TIMEOUT",
  "CODEX_RATE_LIMITED",
  "CODEX_UPSTREAM_UNAVAILABLE",
  "CODEX_PROCESS_SIGNALLED",
  "CODEX_OUTPUT_INVALID",
  "PILOT_WIRE_INVALID",
]);

function safeFailure(error: unknown): string {
  if (error instanceof RuntimeProviderTimeoutError) return "CODEX_TIMEOUT";
  if (error instanceof RuntimeProviderCancelledError) return "PILOT_CANCELLED";
  if (error instanceof RuntimeProviderExecutionError) return error.safeCode;
  return "PILOT_UNEXPECTED_PROVIDER_ERROR";
}

function anonymizeContext(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(anonymizeContext);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !["username", "displayName", "publicBio"].includes(key))
        .map(([key, child]) => [key, anonymizeContext(child)]),
    );
  return value;
}

/** Yalnız model çıktısı üretir; control-plane client, DB veya action executor kurmaz. */
export async function runContractPilot(options: {
  prepare: () => PreparedPilot;
  directory: string;
  provider: RuntimeProvider;
  reader: PilotReader;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  mkdirSync(options.directory, { recursive: true, mode: 0o700 });
  privateDirectory(options.directory);
  const lock = path.join(options.directory, "run.lock");
  let descriptor: number;
  try {
    descriptor = openSync(lock, "wx", 0o600);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST")
      throw new Error("PILOT_ALREADY_RUNNING_OR_STALE_LOCK");
    throw error;
  }
  let state: State | undefined;
  const file = path.join(options.directory, "state.json");
  try {
    writeFileSync(descriptor, JSON.stringify({ pid: process.pid, createdAt: now() }) + "\n");
    fsyncSync(descriptor);
    const journal: State = existsSync(file)
      ? stateSchema.parse(JSON.parse(readPrivate(file)))
      : {
          version: 1,
          study: "P345_2026_10",
          fingerprint: "",
          startedAt: null,
          lastObservedAt: now(),
          attempts: [],
        };
    state = journal;
    const prepared = options.prepare();
    if (!existsSync(file)) journal.fingerprint = prepared.fingerprint;
    if (journal.terminalReason) throw new Error(journal.terminalReason);
    if (journal.fingerprint !== prepared.fingerprint)
      throw new Error("PILOT_FROZEN_CONFIG_CHANGED");
    if (
      journal.attempts.some((attempt, index) => attempt.index !== index + 1) ||
      (journal.attempts.length > 0 && journal.startedAt === null) ||
      journal.attempts.filter((attempt) => attempt.kind === "READER").length > 1 ||
      journal.attempts.filter((attempt) => attempt.kind === "DECISION").length > 23
    )
      throw new Error("PILOT_JOURNAL_INVALID");
    // Süreç kaybında rezervasyon harcanmış kalır. Otomatik temizleme/yeniden deneme yok.
    if (journal.attempts.some((attempt) => attempt.status === "RESERVED"))
      throw new Error("PILOT_UNFINISHED_ATTEMPT");
    const inputLabels = new Set(prepared.inputs.map((input) => input.label));
    if (
      journal.attempts.some(
        (attempt) => attempt.kind === "DECISION" && !inputLabels.has(attempt.label),
      )
    )
      throw new Error("PILOT_JOURNAL_INVALID");
    for (const attempt of journal.attempts) {
      if (
        attempt.outputHash &&
        hash(readPrivate(path.join(options.directory, `${attempt.index}.json`))) !==
          attempt.outputHash
      )
        throw new Error("PILOT_OUTPUT_CHANGED");
    }
    const save = () => atomicPrivateJson(file, journal);
    const remaining = () => {
      const observed = now();
      if (observed < journal.lastObservedAt) throw new Error("PILOT_CLOCK_ROLLBACK");
      journal.lastObservedAt = observed;
      return journal.startedAt === null
        ? 90 * 60_000
        : Math.max(0, journal.startedAt + 90 * 60_000 - observed);
    };
    const reserve = (kind: Attempt["kind"], label: string) => {
      if (options.prepare().fingerprint !== journal.fingerprint)
        throw new Error("PILOT_FROZEN_CONFIG_CHANGED");
      const available = remaining();
      if (available <= 0 || journal.attempts.length >= 24) return null;
      if (
        kind === "DECISION" &&
        journal.attempts.filter((item) => item.kind === "DECISION").length >= 23
      )
        return null;
      if (kind === "READER" && journal.attempts.some((item) => item.kind === "READER")) return null;
      journal.startedAt ??= now();
      const attempt: Attempt = {
        index: journal.attempts.length + 1,
        kind,
        label,
        status: "RESERVED",
        reservedAt: now(),
      };
      journal.attempts.push(attempt);
      save();
      return { attempt, timeoutMs: Math.min(360_000, available) };
    };
    const finish = (attempt: Attempt, output: unknown, safeCode?: string) => {
      attempt.finishedAt = now();
      if (safeCode) {
        attempt.status = "FAILED";
        attempt.safeCode = safeCode;
        if (output !== null) {
          const evidenceFile = path.join(options.directory, `${attempt.index}.json`);
          atomicPrivateJson(evidenceFile, output);
          attempt.outputHash = hash(readPrivate(evidenceFile));
        }
      } else {
        const outputFile = path.join(options.directory, `${attempt.index}.json`);
        atomicPrivateJson(outputFile, output);
        attempt.outputHash = hash(readPrivate(outputFile));
        attempt.status = "VALID_OUTPUT";
      }
      save();
    };
    save();
    if (options.prepare().fingerprint !== journal.fingerprint)
      throw new Error("PILOT_FROZEN_CONFIG_CHANGED");
    if (!journal.attempts.some((item) => item.kind === "READER") && remaining() > 0) {
      const inspected = await options.provider.inspect();
      if (
        !inspected.supportsStructuredOutput ||
        inspected.version !== prepared.config.providerVersion ||
        inspected.model !== prepared.config.model ||
        inspected.reasoningEffort !== prepared.config.reasoningEffort
      )
        throw new Error("PILOT_PROVIDER_FINGERPRINT_CHANGED");
      for (const input of prepared.inputs) {
        while (true) {
          const previous = journal.attempts.filter(
            (item) => item.kind === "DECISION" && item.label === input.label,
          );
          const last = previous.at(-1);
          if (last?.status === "VALID_OUTPUT") break;
          const decisions = journal.attempts.filter((item) => item.kind === "DECISION");
          const retryCount = decisions.length - new Set(decisions.map((item) => item.label)).size;
          if (last && (!retryableCodes.has(last.safeCode ?? "") || retryCount >= 5)) break;
          const reservation = reserve("DECISION", input.label);
          if (!reservation) break;
          let result;
          try {
            result = await options.provider.invoke({
              runId: input.runId,
              prompt: input.prompt,
              outputSchema: input.schema,
              timeoutMs: reservation.timeoutMs,
              debugRetentionHours: 0,
            });
          } catch (error) {
            const code = safeFailure(error);
            finish(reservation.attempt, null, code);
            if (!retryableCodes.has(code)) throw new Error(code);
            continue;
          }
          if (
            result.version !== prepared.config.providerVersion ||
            result.model !== prepared.config.model ||
            result.reasoningEffort !== prepared.config.reasoningEffort
          ) {
            finish(reservation.attempt, null, "PILOT_PROVIDER_FINGERPRINT_CHANGED");
            throw new Error("PILOT_PROVIDER_FINGERPRINT_CHANGED");
          }
          if (!parseRuntimeDecisionOutput(result.output).success) {
            finish(reservation.attempt, { output: result.output }, "PILOT_WIRE_INVALID");
            continue;
          }
          finish(reservation.attempt, {
            output: result.output,
            providerVersion: result.version,
            model: result.model,
            reasoningEffort: result.reasoningEffort,
            durationMs: result.durationMs,
          });
        }
      }
      const reservation = reserve("READER", "contract-reader");
      if (reservation) {
        const packet = JSON.stringify({
          criteria: prepared.criteria,
          cases: prepared.inputs.map((input) => {
            const attempts = journal.attempts.filter(
              (item) => item.kind === "DECISION" && item.label === input.label,
            );
            const valid = attempts.find((item) => item.status === "VALID_OUTPUT");
            return {
              label: input.label,
              feature: input.feature,
              context: anonymizeContext(input.perception),
              output: valid
                ? (JSON.parse(readPrivate(path.join(options.directory, `${valid.index}.json`)))
                    .output as unknown)
                : null,
              attempts: attempts.map((item) => ({
                status: item.status,
                safeCode: item.safeCode ?? null,
              })),
            };
          }),
        });
        try {
          const report = await options.reader.invoke(packet, reservation.timeoutMs);
          if (report.model !== "claude-opus-5") throw new Error("PILOT_READER_MODEL_CHANGED");
          finish(reservation.attempt, report);
        } catch {
          finish(reservation.attempt, null, "PILOT_READER_INCOMPLETE");
        }
      }
    }
    if (options.prepare().fingerprint !== journal.fingerprint)
      throw new Error("PILOT_FROZEN_CONFIG_CHANGED");
    const withinTime = remaining() > 0;
    save();
    const valid = new Set(
      journal.attempts
        .filter((item) => item.kind === "DECISION" && item.status === "VALID_OUTPUT")
        .map((item) => item.label),
    ).size;
    const readerComplete = journal.attempts.some(
      (item) => item.kind === "READER" && item.status === "VALID_OUTPUT",
    );
    return {
      status:
        valid === 18 && readerComplete && withinTime
          ? "OUTPUTS_RECORDED_NOT_BEHAVIOR_PASS"
          : "INCOMPLETE",
      validDecisions: valid,
      readerComplete,
      calls: journal.attempts.length,
      elapsedMs: journal.startedAt === null ? 0 : now() - journal.startedAt,
    };
  } catch (error) {
    // Değişen kaynak/config veya fatal hata çalışma kaydını kapatır; geri almak bütçeyi açmaz.
    if (state && (existsSync(file) || state.attempts.length > 0) && !state.terminalReason) {
      state.terminalReason =
        error instanceof Error && /^PILOT_[A-Z0-9_]+$/u.test(error.message)
          ? error.message
          : "PILOT_FATAL_ERROR";
      atomicPrivateJson(file, state);
    }
    throw error;
  } finally {
    closeSync(descriptor);
    unlinkSync(lock);
  }
}
