import assert from "node:assert/strict";
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
import { atomicPrivateJson, hash, privateDirectory, readPrivate } from "../contract-pilot/files";
import {
  AUTHORITY_END,
  DECISION_TIMEOUT_MS,
  MANUAL_REVIEW_RESERVE_MS,
  MIN_CALL_MS,
  PILOT_DURATION_MS,
  READER_RESERVE_MS,
  monotonicWallClock,
  safePilotCode,
} from "../contract-pilot/policy";
import type { PilotReader } from "../contract-pilot/run";
import type { PersonaPhase, PreparedPersonaPilot } from "./input";
import { canStartPersonaHoldout } from "./phase";
import { evaluatePersonaReview, validatePersonaReport, type BlindCase } from "./review";

const phaseSchema = z.enum(["development", "holdout"]);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const codeSchema = z.string().regex(/^[A-Z0-9_]+$/u);
const attemptSchema = z
  .object({
    index: z.number().int().min(1).max(26),
    kind: z.enum(["DECISION", "READER"]),
    phase: phaseSchema,
    label: z.string(),
    status: z.enum(["RESERVED", "VALID_OUTPUT", "FAILED"]),
    reservedAt: z.number().finite(),
    finishedAt: z.number().finite().optional(),
    outputHash: digest.optional(),
    packetHash: digest.optional(),
    safeCode: codeSchema.optional(),
  })
  .strict();
const stateSchema = z
  .object({
    version: z.literal(1),
    study: z.literal("P2_2026_10"),
    fingerprint: digest,
    startedAt: z.number().finite().nullable(),
    lastObservedAt: z.number().finite(),
    attempts: z.array(attemptSchema).max(26),
    reviews: z
      .array(
        z.object({ phase: phaseSchema, hash: digest, recordedAt: z.number().finite() }).strict(),
      )
      .max(2),
    terminalReason: codeSchema.optional(),
  })
  .strict();
type State = z.infer<typeof stateSchema>;
type Attempt = z.infer<typeof attemptSchema>;
const technical = new Set([
  "CODEX_TIMEOUT",
  "CODEX_RATE_LIMITED",
  "CODEX_UPSTREAM_UNAVAILABLE",
  "CODEX_PROCESS_SIGNALLED",
  "CODEX_OUTPUT_INVALID",
  "PILOT_WIRE_INVALID",
]);
function providerFailure(error: unknown) {
  if (error instanceof RuntimeProviderTimeoutError) return "CODEX_TIMEOUT";
  if (error instanceof RuntimeProviderCancelledError) return "PILOT_CANCELLED";
  if (error instanceof RuntimeProviderExecutionError) return error.safeCode;
  return "PILOT_UNEXPECTED_PROVIDER_ERROR";
}

/** Tek pilot kimliği, tek saat; normal karar üretir, yayın/DB/control-plane kurmaz.
 * Bilerek otomatik teknik retry yok: 24 ilk kolun tamamı bütçeyi kullanır. */
export async function runPersonaPilot(options: {
  prepare: () => PreparedPersonaPilot;
  directory: string;
  provider: RuntimeProvider;
  reader: PilotReader;
  review?: { phase: PersonaPhase; value: unknown };
  now?: () => number;
}) {
  const now = options.now ?? monotonicWallClock();
  mkdirSync(options.directory, { recursive: true, mode: 0o700 });
  privateDirectory(options.directory);
  const lock = path.join(options.directory, "run.lock");
  let fd: number;
  try {
    fd = openSync(lock, "wx", 0o600);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST")
      throw new Error("PILOT_ALREADY_RUNNING_OR_STALE_LOCK");
    throw error;
  }
  const stateFile = path.join(options.directory, "state.json");
  let state: State | undefined;
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: now() }) + "\n");
    fsyncSync(fd);
    if (existsSync(stateFile)) state = stateSchema.parse(JSON.parse(readPrivate(stateFile)));
    const prepared = options.prepare();
    state ??= {
      version: 1,
      study: "P2_2026_10",
      fingerprint: prepared.fingerprint,
      startedAt: null,
      lastObservedAt: now(),
      attempts: [],
      reviews: [],
    };
    const journal = state;
    const save = () => atomicPrivateJson(stateFile, journal);
    const remaining = () => {
      const observed = now();
      if (observed < journal.lastObservedAt - 2000) throw new Error("PILOT_CLOCK_ROLLBACK");
      journal.lastObservedAt = Math.max(journal.lastObservedAt, observed);
      return journal.startedAt === null
        ? PILOT_DURATION_MS
        : Math.max(0, journal.startedAt + PILOT_DURATION_MS - journal.lastObservedAt);
    };
    const assertFrozen = () => {
      if (options.prepare().fingerprint !== journal.fingerprint)
        throw new Error("PILOT_FROZEN_CONFIG_CHANGED");
    };
    assertFrozen();
    if (journal.terminalReason) throw new Error(journal.terminalReason);
    if (
      journal.attempts.some((item, i) => item.index !== i + 1) ||
      (journal.attempts.length > 0 && journal.startedAt === null) ||
      new Set(journal.attempts.map((item) => item.label)).size !== journal.attempts.length ||
      new Set(journal.reviews.map((item) => item.phase)).size !== journal.reviews.length ||
      journal.attempts.filter((item) => item.kind === "DECISION").length > 24
    )
      throw new Error("PILOT_JOURNAL_INVALID");
    if (journal.attempts.some((item) => item.status === "RESERVED"))
      throw new Error("PILOT_UNFINISHED_ATTEMPT");
    const outputFile = (item: Attempt) => path.join(options.directory, `${item.index}.json`);
    for (const item of journal.attempts) {
      if (
        item.kind === "DECISION" &&
        !prepared.pairs.some(
          (pair) =>
            pair.phase === item.phase && pair.inputs.some((input) => input.label === item.label),
        )
      )
        throw new Error("PILOT_JOURNAL_INVALID");
      if (item.kind === "READER" && item.label !== `${item.phase}-reader`)
        throw new Error("PILOT_JOURNAL_INVALID");
      if (item.status === "VALID_OUTPUT" && !item.outputHash)
        throw new Error("PILOT_JOURNAL_INVALID");
      if (item.outputHash && hash(readPrivate(outputFile(item))) !== item.outputHash)
        throw new Error("PILOT_OUTPUT_CHANGED");
      if (
        item.kind === "READER" &&
        (!item.packetHash ||
          hash(readPrivate(path.join(options.directory, `${item.phase}-packet.json`))) !==
            item.packetHash)
      )
        throw new Error("PILOT_OUTPUT_CHANGED");
    }
    const packetFor = (phase: PersonaPhase): BlindCase[] =>
      prepared.pairs
        .filter((pair) => pair.phase === phase)
        .map((pair) => {
          const outputs = pair.inputs.map((input) => {
            const attempt = journal.attempts.find(
              (item) => item.label === input.label && item.status === "VALID_OUTPUT",
            );
            return attempt
              ? (JSON.parse(readPrivate(outputFile(attempt))).output as unknown)
              : null;
          });
          return {
            caseId: pair.caseId,
            preferences: pair.preferences,
            context: pair.perception,
            outputs: { A: outputs[0], B: outputs[1] },
          };
        });
    const evaluateReview = (phase: PersonaPhase, value: unknown) => {
      const reader = journal.attempts.find(
        (item) => item.kind === "READER" && item.phase === phase && item.status === "VALID_OUTPUT",
      );
      if (!reader?.outputHash || !reader.packetHash)
        throw new Error("PILOT_PERSONA_READER_REQUIRED");
      const packet = packetFor(phase);
      assert.deepEqual(
        JSON.parse(readPrivate(path.join(options.directory, `${phase}-packet.json`))),
        { cases: packet },
        "PILOT_PERSONA_READER_PACKET_CHANGED",
      );
      return evaluatePersonaReview(value, {
        readerOutputHash: reader.outputHash,
        packetHash: reader.packetHash,
        report: JSON.parse(JSON.parse(readPrivate(outputFile(reader))).report),
        packet,
        pairs: prepared.pairs.filter((pair) => pair.phase === phase),
      });
    };
    const reviews = new Map<PersonaPhase, ReturnType<typeof evaluatePersonaReview>>();
    for (const item of journal.reviews) {
      const bytes = readPrivate(path.join(options.directory, `${item.phase}-review.json`));
      if (
        hash(bytes) !== item.hash ||
        journal.startedAt === null ||
        item.recordedAt < journal.startedAt ||
        item.recordedAt >= journal.startedAt + PILOT_DURATION_MS
      )
        throw new Error("PILOT_PERSONA_REVIEW_BINDING_CHANGED");
      reviews.set(item.phase, evaluateReview(item.phase, JSON.parse(bytes)));
    }
    if (
      journal.attempts.some((item) => item.phase === "holdout") &&
      reviews.get("development")?.status !== "THRESHOLD_MET"
    )
      throw new Error("PILOT_PERSONA_HOLDOUT_GATE_CLOSED");
    const summary = (status: string) => {
      const remainingMs = remaining();
      save();
      return {
        status,
        runtimeCalls: journal.attempts.filter((item) => item.kind === "DECISION").length,
        readerCalls: journal.attempts.filter((item) => item.kind === "READER").length,
        development: reviews.get("development") ?? null,
        holdout: reviews.get("holdout") ?? null,
        manualReviewRemainingMs: remainingMs,
        deadlineAt:
          journal.startedAt === null
            ? null
            : new Date(journal.startedAt + PILOT_DURATION_MS).toISOString(),
      };
    };
    // Süresinde kapanmış iki incelemenin sonucu daha sonra okununca kaybolmaz.
    if (!options.review && reviews.has("holdout"))
      return summary(
        reviews.get("holdout")!.status === "THRESHOLD_MET"
          ? "BOTH_THRESHOLDS_MET_NOT_BEHAVIOR_PASS"
          : reviews.get("holdout")!.status,
      );
    if (remaining() <= 0) {
      journal.terminalReason = "PILOT_TIME_EXHAUSTED";
      return summary("INCOMPLETE");
    }
    if (options.review) {
      if (reviews.has(options.review.phase))
        throw new Error("PILOT_PERSONA_REVIEW_ALREADY_RECORDED");
      const result = evaluateReview(options.review.phase, options.review.value);
      assertFrozen();
      if (remaining() <= 0) throw new Error("PILOT_TIME_EXHAUSTED");
      const file = path.join(options.directory, `${options.review.phase}-review.json`);
      atomicPrivateJson(file, options.review.value);
      if (remaining() <= 0) throw new Error("PILOT_TIME_EXHAUSTED");
      journal.reviews.push({
        phase: options.review.phase,
        hash: hash(readPrivate(file)),
        recordedAt: journal.lastObservedAt,
      });
      reviews.set(options.review.phase, result);
      save();
      // İnceleme komutu kendiliğinden bir sonraki model aşamasını başlatmaz.
      return summary("REVIEW_RECORDED_NOT_BEHAVIOR_PASS");
    }
    const development = reviews.get("development");
    if (development && development.status !== "THRESHOLD_MET") return summary(development.status);
    const phase: PersonaPhase = development ? "holdout" : "development";
    const runtimeCalls = journal.attempts.filter((item) => item.kind === "DECISION").length;
    if (
      development &&
      !journal.attempts.some((item) => item.phase === "holdout") &&
      !canStartPersonaHoldout(development, runtimeCalls, remaining())
    ) {
      journal.terminalReason = "PILOT_PERSONA_HOLDOUT_BUDGET_CLOSED";
      return summary("INCOMPLETE");
    }
    if (journal.attempts.some((item) => item.kind === "READER" && item.phase === phase))
      return summary(
        journal.attempts.some(
          (item) =>
            item.kind === "READER" && item.phase === phase && item.status === "VALID_OUTPUT",
        )
          ? "AWAITING_SOURCE_REVIEW"
          : "INCOMPLETE",
      );
    await options.reader.inspect();
    const inspected = await options.provider.inspect();
    if (
      !inspected.supportsStructuredOutput ||
      inspected.version !== prepared.config.providerVersion ||
      inspected.model !== prepared.config.model ||
      inspected.reasoningEffort !== prepared.config.reasoningEffort
    )
      throw new Error("PILOT_PROVIDER_FINGERPRINT_CHANGED");
    const reserve = (kind: Attempt["kind"], label: string, packetHash?: string) => {
      assertFrozen();
      if (journal.startedAt === null && now() + PILOT_DURATION_MS > AUTHORITY_END)
        throw new Error("PILOT_START_WINDOW_TOO_SHORT");
      // İlk aşamada iki okuma + iki kaynak kontrolü için toplam 30 dakika korunur.
      const reserveMs =
        kind === "DECISION"
          ? READER_RESERVE_MS * (phase === "development" ? 2 : 1)
          : MANUAL_REVIEW_RESERVE_MS;
      const available = remaining() - reserveMs;
      if (
        available < MIN_CALL_MS ||
        journal.attempts.filter((item) => item.kind === kind).length >=
          (kind === "DECISION" ? 24 : 2)
      )
        return null;
      journal.startedAt ??= journal.lastObservedAt;
      const attempt: Attempt = {
        index: journal.attempts.length + 1,
        kind,
        phase,
        label,
        status: "RESERVED",
        reservedAt: journal.lastObservedAt,
        ...(packetHash ? { packetHash } : {}),
      };
      journal.attempts.push(attempt);
      save();
      return {
        attempt,
        timeoutMs: Math.min(
          kind === "DECISION" ? DECISION_TIMEOUT_MS : READER_RESERVE_MS - MANUAL_REVIEW_RESERVE_MS,
          available,
        ),
      };
    };
    const finish = (attempt: Attempt, output: unknown | null, safeCode?: string) => {
      remaining();
      attempt.finishedAt = journal.lastObservedAt;
      if (output !== null) {
        atomicPrivateJson(outputFile(attempt), output);
        attempt.outputHash = hash(readPrivate(outputFile(attempt)));
      }
      attempt.status = safeCode ? "FAILED" : "VALID_OUTPUT";
      if (safeCode) attempt.safeCode = safeCode;
      save();
    };
    for (const input of prepared.pairs
      .filter((pair) => pair.phase === phase)
      .flatMap((pair) => pair.inputs)) {
      if (journal.attempts.some((item) => item.label === input.label)) continue;
      const reservation = reserve("DECISION", input.label);
      if (!reservation) break;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), reservation.timeoutMs);
      let result;
      try {
        result = await options.provider.invoke({
          runId: input.runId,
          prompt: input.prompt,
          outputSchema: input.schema,
          timeoutMs: reservation.timeoutMs,
          debugRetentionHours: 0,
          signal: controller.signal,
        });
      } catch (error) {
        const code = controller.signal.aborted ? "CODEX_TIMEOUT" : providerFailure(error);
        finish(reservation.attempt, null, code);
        if (!technical.has(code)) throw new Error(code);
        continue;
      } finally {
        clearTimeout(timer);
      }
      if (
        result.version !== prepared.config.providerVersion ||
        result.model !== prepared.config.model ||
        result.reasoningEffort !== prepared.config.reasoningEffort
      ) {
        finish(reservation.attempt, null, "PILOT_PROVIDER_FINGERPRINT_CHANGED");
        throw new Error("PILOT_PROVIDER_FINGERPRINT_CHANGED");
      }
      finish(
        reservation.attempt,
        result,
        controller.signal.aborted
          ? "CODEX_TIMEOUT"
          : !parseRuntimeDecisionOutput(result.output).success
            ? "PILOT_WIRE_INVALID"
            : undefined,
      );
    }
    const packet = packetFor(phase);
    const packetFile = path.join(options.directory, `${phase}-packet.json`);
    if (existsSync(packetFile))
      assert.deepEqual(
        JSON.parse(readPrivate(packetFile)),
        { cases: packet },
        "PILOT_PERSONA_READER_PACKET_CHANGED",
      );
    else atomicPrivateJson(packetFile, { cases: packet });
    const reservation = reserve("READER", `${phase}-reader`, hash(readPrivate(packetFile)));
    if (reservation) {
      let report: Awaited<ReturnType<PilotReader["invoke"]>> | null = null;
      try {
        report = await options.reader.invoke(
          JSON.stringify({ cases: packet }),
          reservation.timeoutMs,
        );
        if (
          report.model !== "claude-opus-5" ||
          report.observedModels.length !== 1 ||
          report.observedModels[0] !== "claude-opus-5"
        )
          throw new Error("PILOT_READER_MODEL_CHANGED");
        if (report.version !== prepared.config.readerVersion)
          throw new Error("PILOT_READER_VERSION_CHANGED");
        validatePersonaReport(JSON.parse(report.report), packet);
        finish(reservation.attempt, report);
      } catch (error) {
        finish(reservation.attempt, report, safePilotCode(error, "PILOT_READER_INCOMPLETE"));
      }
    }
    assertFrozen();
    if (remaining() <= 0) {
      journal.terminalReason = "PILOT_TIME_EXHAUSTED";
      return summary("INCOMPLETE");
    }
    return summary(
      reservation?.attempt.status === "VALID_OUTPUT" ? "AWAITING_SOURCE_REVIEW" : "INCOMPLETE",
    );
  } catch (error) {
    if (state && (existsSync(stateFile) || state.attempts.length) && !state.terminalReason) {
      state.terminalReason = safePilotCode(error, "PILOT_FATAL_ERROR");
      atomicPrivateJson(stateFile, state);
    }
    throw error;
  } finally {
    closeSync(fd);
    unlinkSync(lock);
  }
}
