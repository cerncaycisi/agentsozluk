import {
  RuntimeProviderCancelledError,
  RuntimeProviderTimeoutError,
  type RuntimeProvider,
  type RuntimeProviderResult,
} from "@/runtime/provider";
import type {
  RuntimeContext,
  RuntimeControlPlane,
  RuntimeDailyPlanControlPlane,
  RuntimeExecution,
  RuntimeLifeEventsBatch,
} from "@/runtime/control-plane-client";
import {
  runtimeDecisionJsonSchema,
  runtimeDecisionSchema,
  normalizeRuntimeDecisionOutput,
  parseRuntimeDecisionOutput,
  runtimeNormalDecisionWireJsonSchema,
  type RuntimeDecision,
} from "@/runtime/output";
import { z } from "zod";
import { MAX_SOURCE_READ_TIMEOUT_MS, type SafeSourceReader } from "@/runtime/source-reader";
import { RuntimeRunDeadline } from "@/runtime/run-deadline";
import { duplicateRepairCandidateIsSafe } from "@/modules/agents/domain/action-policy";
import { sourceFetchTargetLimit } from "@/modules/agents/domain/runtime-controls";
import { runtimeFastStateSchema } from "@/modules/agents/validation/runtime-schemas";
import {
  RUNTIME_PROMPT_PROFILE_HASH,
  runtimeAllowedAgentContextKeys,
  runtimeAllowedPerceptionKeys,
  runtimeAllowedRunContextKeys,
  runtimeForbiddenContextMetadataKeys,
  runtimePromptInvariants,
  runtimePromptScaffold,
} from "@/runtime/prompt-profile";

export { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";

export interface RuntimeWorkerOptions {
  workerId: string;
  credentials: string[];
  controlPlane: RuntimeControlPlane;
  provider: RuntimeProvider;
  sourceReader?: Pick<SafeSourceReader, "read">;
  heartbeatIntervalMs?: number;
  pollIntervalMs?: number;
  processingLanes?: number;
  dailyPlanning?: {
    credential: string;
    controlPlane: RuntimeDailyPlanControlPlane;
  };
  now?: () => Date;
  dailyPlanningRetryMs?: number;
  onSafeEvent?: (event: { level: "info" | "error"; code: string; runId?: string }) => void;
}

export const DEFAULT_RUNTIME_HEARTBEAT_INTERVAL_MS = 10_000;
export const MAX_RUNTIME_PROCESSING_LANES = 2;
export const ISTANBUL_DAILY_PLAN_MINUTE = 5;
export const DEFAULT_DAILY_PLANNING_RETRY_MS = 5 * 60_000;
export const RUNTIME_STRUCTURED_REPAIR_INSTRUCTION =
  "Önceki çıktı uygulamanın semantik structured-output doğrulamasını geçmedi. Tek repair hakkını kullan: her decisionJournal subject değeri kısa, insan-okur bir konu veya eylem etiketi olsun; UUID, digest/hash, URL, e-posta, credential, secret veya token değerini subject içine kopyalama; teknik kimlikleri yalnız evidenceIds/targetId gibi şema alanlarında tut; decisionJournal seq değerlerini benzersiz ve artan tut; causedBySeqs yalnız daha önceki seq değerlerine bağlansın; NO_ACTION dışındaki her action ve türetilen delta/proposal geçerli bir OPTION_SELECTED kaydına selectedOptionSeq ile bağlansın; her action claimProvenance içindeki bütün kanıt grupları tek ve aynı provenance türünü kullansın, farklı türleri karıştırma; provenance için yalnız perception.evidenceCatalog içindeki exact evidenceType/evidenceId eşleşmelerini kullan, author/source/target user id kanıt değildir; geçerli eşleşme yoksa NO_ACTION üret; topicFatigue içindeki topicKey değerleri benzersiz olsun; action ve türetilen delta/proposal toplamı 50'yi aşmasın. Yalnız geçerli structured JSON üret.";

export function istanbulPlanningClock(now: Date): { dateKey: string; minuteOfDay: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    minuteOfDay: Number(values.hour) * 60 + Number(values.minute),
  };
}

const memoryConsolidationTriggers = new Set([
  "NIGHTLY_MEMORY_CONSOLIDATION",
  "ADMIN_MEMORY_RECONSOLIDATE",
]);

const allowedPerceptionKeys = new Set<string>(runtimeAllowedPerceptionKeys);
const forbiddenContextMetadataKeys = new Set<string>(runtimeForbiddenContextMetadataKeys);
const previousTopicFatiguePath = "perception.previousFastState.topicFatigue";

function normalizedMetadataKey(key: string): string {
  return key
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replaceAll(/[^a-z0-9]/gu, "");
}

function assertNoForbiddenContextMetadata(value: unknown, path = "perception"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenContextMetadata(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  const hasSchemaValidDynamicKeys =
    path === previousTopicFatiguePath &&
    runtimeFastStateSchema.shape.topicFatigue.safeParse(value).success;
  for (const [key, nested] of Object.entries(value)) {
    if (!hasSchemaValidDynamicKeys && forbiddenContextMetadataKeys.has(normalizedMetadataKey(key)))
      throw new Error(`RUNTIME_CONTEXT_FORBIDDEN_METADATA:${path}.${key}`);
    assertNoForbiddenContextMetadata(nested, `${path}.${key}`);
  }
}

function projectRuntimePerception(perception: Record<string, unknown>): Record<string, unknown> {
  assertNoForbiddenContextMetadata(perception);
  return Object.fromEntries(
    Object.entries(perception).filter(([key]) => allowedPerceptionKeys.has(key)),
  );
}

function projectAllowedFields(
  value: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function isMemoryConsolidationRun(context: RuntimeContext): boolean {
  return (
    context.run.runType === "REFLECTION" && memoryConsolidationTriggers.has(context.run.trigger)
  );
}

function isPersonaReflectionRun(context: RuntimeContext): boolean {
  return context.run.runType === "REFLECTION" && !isMemoryConsolidationRun(context);
}

function serializeUntrustedContext(value: Record<string, unknown>): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError("Runtime context serialize edilemedi.");
  return serialized.replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");
}

const runtimeEvidenceTypes = [
  "PLATFORM_EVENT",
  "USER_ENTRY",
  "TRUSTED_SOURCE",
  "PROBATION_SOURCE",
  "MULTIPLE_SOURCES",
  "AGENT_MEMORY",
] as const;

type RuntimeEvidenceType = (typeof runtimeEvidenceTypes)[number];
type RuntimeEvidenceCatalog = Record<RuntimeEvidenceType, string[]>;

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" ? value[key] : null;
}

function nestedStringField(value: Record<string, unknown>, parent: string, key: string) {
  const nested = value[parent];
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? stringField(nested as Record<string, unknown>, key)
    : null;
}

function runtimeEvidenceCatalog(context: RuntimeContext): RuntimeEvidenceCatalog {
  const perception = context.perception;
  const recentEntries = [
    ...recordArray(perception.recentEntries),
    ...recordArray(perception.ownRecentEntries),
  ];
  const sourceItems = recordArray(perception.sourceItems);
  const trustedSourceIds = sourceItems.flatMap((item) =>
    item.sourceStatus === "TRUSTED" && stringField(item, "itemId")
      ? [stringField(item, "itemId")!]
      : [],
  );
  const probationSourceIds = sourceItems.flatMap((item) =>
    item.sourceStatus === "PROBATION" && stringField(item, "itemId")
      ? [stringField(item, "itemId")!]
      : [],
  );
  const unique = (values: Array<string | null>) => [...new Set(values.filter(Boolean) as string[])];
  return {
    PLATFORM_EVENT: unique([
      context.run.id,
      ...recentEntries.map((entry) => nestedStringField(entry, "topic", "id")),
    ]),
    USER_ENTRY: unique(recentEntries.map((entry) => stringField(entry, "id"))),
    TRUSTED_SOURCE: unique(trustedSourceIds),
    PROBATION_SOURCE: unique(probationSourceIds),
    MULTIPLE_SOURCES: unique([...trustedSourceIds, ...probationSourceIds]),
    AGENT_MEMORY: unique(
      recordArray(perception.memories).map((memory) => stringField(memory, "id")),
    ),
  };
}

function runtimeDecisionUsesCatalog(
  decision: RuntimeDecision,
  catalog: RuntimeEvidenceCatalog,
): boolean {
  const allowed = Object.fromEntries(
    runtimeEvidenceTypes.map((evidenceType) => [evidenceType, new Set(catalog[evidenceType])]),
  ) as Record<RuntimeEvidenceType, Set<string>>;
  return decision.actions.every((action) => {
    if (action.actionType === "NO_ACTION" || !action.provenance) return true;
    return action.provenance.evidenceIds.every((id) =>
      allowed[action.provenance!.evidenceType].has(id),
    );
  });
}

function buildContentRepairPrompt(
  trustedPrompt: string,
  originalAction: RuntimeDecision["actions"][number],
  rejectionCode: string,
): string {
  const repairInstruction =
    rejectionCode === "USER_ENTRY_HIGH_RISK_REPRODUCTION"
      ? "Başka entry'den doğrudan alıntıyı, entry/yazar/kullanıcı atfını ve görünür referansı tamamen kaldır. Düşünceyi yalnız kendi bağımsız sözlerinle, tek başına okunabilen bir sözlük entry'si olarak yeniden kur."
      : "Duplicate veya tekrarlanan çerçeveyi kaldır; aynı kanıtla gerçekten farklı ve bağımsız bir anlatım kur.";
  return [
    trustedPrompt,
    "",
    "# Tek content reconsideration hakkı",
    "Aşağıdaki reddedilen content action için yalnız bir repair adayı üret. actionType, targetType, targetId, body dışındaki input alanları ve provenance aynı kalmalı; yalnız body gerçekten farklılaşabilir.",
    repairInstruction,
    "Kaynakta bulunmayan sayı, doğrudan alıntı veya spesifik olay ekleme. Güvenli repair mümkün değilse yalnız safeReason taşıyan NO_ACTION üret. Başka action, delta veya açıklama üretme.",
    "<REJECTED_CANDIDATE>",
    serializeUntrustedContext({ action: originalAction }),
    "</REJECTED_CANDIDATE>",
  ].join("\n");
}

function safeContentRepairCandidate(
  originalAction: RuntimeDecision["actions"][number],
  decision: RuntimeDecision,
  sequence: number,
): (RuntimeDecision["actions"][number] & { repairOfSequence: number }) | null {
  if (decision.actions.length !== 1) return null;
  const candidate = decision.actions[0]!;
  const repaired = {
    ...candidate,
    sequence,
    repairOfSequence: originalAction.sequence,
  };
  return duplicateRepairCandidateIsSafe(originalAction, repaired) ? repaired : null;
}

export function buildRuntimePrompt(context: RuntimeContext): string {
  const projectedPerception = projectRuntimePerception(context.perception);
  const safeContext = {
    run: projectAllowedFields(context.run, runtimeAllowedRunContextKeys),
    agent: projectAllowedFields(context.agent, runtimeAllowedAgentContextKeys),
    personaVersion: context.persona.version,
    perception: {
      ...projectedPerception,
      evidenceCatalog: runtimeEvidenceCatalog(context),
    },
  };
  return [
    context.persona.renderedPrompt,
    "",
    runtimePromptScaffold.runtimeHeading,
    runtimePromptInvariants[0],
    runtimePromptInvariants[1],
    ...(context.run.runType === "REFLECTION"
      ? []
      : [
          runtimePromptScaffold.normalOutputHeading,
          ...runtimePromptScaffold.normalOutputInstructions,
        ]),
    ...(isMemoryConsolidationRun(context)
      ? [runtimePromptScaffold.maintenanceHeading, ...runtimePromptScaffold.maintenanceInstructions]
      : []),
    ...(isPersonaReflectionRun(context)
      ? [runtimePromptScaffold.reflectionHeading, ...runtimePromptScaffold.reflectionInstructions]
      : []),
    ...(context.run.adminInstruction
      ? [runtimePromptScaffold.adminHeading, context.run.adminInstruction]
      : []),
    runtimePromptInvariants[2],
    runtimePromptInvariants[3],
    "",
    runtimePromptScaffold.untrustedOpening,
    serializeUntrustedContext(safeContext),
    runtimePromptScaffold.untrustedClosing,
    "",
    runtimePromptInvariants[4],
    runtimePromptInvariants[5],
  ].join("\n");
}

function runtimeOutputJsonSchema(context: RuntimeContext): Record<string, unknown> {
  return context.run.runType === "REFLECTION"
    ? runtimeDecisionJsonSchema
    : runtimeNormalDecisionWireJsonSchema;
}

function parseDecisionForContext(context: RuntimeContext, output: unknown) {
  if (context.run.runType === "REFLECTION")
    return runtimeDecisionSchema.safeParse(normalizeRuntimeDecisionOutput(output));
  return parseRuntimeDecisionOutput(output);
}

function normalizedDecision(
  decision: RuntimeDecision,
  options: { reflectionOnly: boolean },
): RuntimeDecision {
  if (options.reflectionOnly)
    return {
      ...decision,
      actions: [
        {
          sequence: 1,
          actionType: "NO_ACTION",
          desire: 0,
          expectedOutcome: "Reflection run dış dünyada bir state değişikliği oluşturmayacak.",
          selectedOptionSeq: null,
          safeReason: "Reflection run public action üretmeden güvenli biçimde tamamlandı.",
          input: {},
        },
      ],
      beliefDeltas: [],
      relationshipDeltas: [],
      sourceProposals: [],
      memoryCandidates: [],
    };
  let sequence = Math.max(0, ...decision.actions.map((action) => action.sequence));
  const derived = [
    ...decision.beliefDeltas.map((delta) => ({
      sequence: (sequence += 1),
      actionType: "UPDATE_BELIEF" as const,
      desire: delta.desire,
      expectedOutcome: delta.expectedOutcome,
      selectedOptionSeq: delta.selectedOptionSeq,
      safeReason: "Gözlenen kanıt kontrollü bir belief güncellemesini destekliyor.",
      input: {
        topicKey: delta.topicKey,
        statement: delta.statement,
        confidence: delta.confidence,
        summary: delta.evidenceSummary,
      },
      provenance: delta.provenance,
    })),
    ...decision.relationshipDeltas.map((delta) => ({
      sequence: (sequence += 1),
      actionType: "UPDATE_RELATIONSHIP_NOTE" as const,
      desire: delta.desire,
      expectedOutcome: delta.expectedOutcome,
      selectedOptionSeq: delta.selectedOptionSeq,
      safeReason: "Görünür etkileşim relationship notunun güncellenmesini destekliyor.",
      targetType: "USER",
      targetId: delta.userId,
      input: {
        userId: delta.userId,
        familiarity: delta.familiarity,
        trust: delta.trust,
        interest: delta.interest,
        disagreement: delta.disagreement,
        summary: delta.summary,
      },
      provenance: delta.provenance,
    })),
    ...decision.sourceProposals.map((proposal) => ({
      sequence: (sequence += 1),
      actionType: "PROPOSE_SOURCE" as const,
      desire: proposal.desire,
      expectedOutcome: proposal.expectedOutcome,
      selectedOptionSeq: proposal.selectedOptionSeq,
      safeReason: "Gözlenen source adayı kontrollü değerlendirme için öneriliyor.",
      input: {
        url: proposal.url,
        sourceType: proposal.sourceType,
        topics: proposal.topics,
      },
      provenance: proposal.provenance,
    })),
  ];
  const actions = [...decision.actions, ...derived];
  if (actions.length > 50) throw new Error("RUNTIME_DECISION_ACTION_CAPACITY_EXCEEDED");
  if (actions.length > 0) return { ...decision, actions };
  return {
    ...decision,
    actions: [
      {
        sequence: 1,
        actionType: "NO_ACTION",
        desire: 0,
        expectedOutcome: "Bu run dış dünyada bir state değişikliği oluşturmayacak.",
        selectedOptionSeq: null,
        safeReason: "Bu run için güvenli ve gerekli bir action bulunmadı.",
        input: {},
      },
    ],
  };
}

function actionForControlPlane(
  action: RuntimeDecision["actions"][number] & { repairOfSequence?: number },
): Record<string, unknown> {
  const { desire, expectedOutcome, selectedOptionSeq, ...rest } = action;
  void desire;
  void expectedOutcome;
  void selectedOptionSeq;
  return rest;
}

function lifeEventsForDecision(
  decision: Pick<
    RuntimeDecision,
    "observations" | "memoryCandidates" | "decisionJournal" | "actions"
  >,
): RuntimeLifeEventsBatch {
  return {
    observations: decision.observations,
    memoryCandidates: decision.memoryCandidates,
    decisionJournal: decision.decisionJournal,
    actionIntents: decision.actions.map(
      ({ sequence, desire, expectedOutcome, selectedOptionSeq }) => ({
        sequence,
        desire,
        expectedOutcome,
        selectedOptionSeq,
      }),
    ),
  };
}

function measuredExecution(execution: RuntimeExecution) {
  const succeeded = execution.actions.filter(({ actionStatus }) => actionStatus === "SUCCEEDED");
  const skipped = execution.actions.filter(({ actionStatus }) => actionStatus === "SKIPPED");
  const rejected = execution.actions.filter(({ actionStatus }) =>
    ["REJECTED", "FAILED"].includes(actionStatus),
  );
  return {
    succeeded,
    skipped,
    rejected,
    publishedEntries: succeeded.filter(({ actionType }) =>
      ["CREATE_ENTRY", "CREATE_TOPIC_WITH_ENTRY"].includes(actionType),
    ).length,
    createdTopics: succeeded.filter(({ actionType }) => actionType === "CREATE_TOPIC_WITH_ENTRY")
      .length,
    votes: succeeded.filter(({ actionType }) =>
      ["VOTE_UP", "VOTE_DOWN", "REMOVE_VOTE"].includes(actionType),
    ).length,
  };
}

export class AgentRuntimeWorker {
  readonly #options: RuntimeWorkerOptions;
  readonly #processingLanes: number;
  #runOnceInFlight: Promise<number> | null = null;
  #completedPlanningDateKey: string | null = null;
  #planningRetryNotBefore = 0;

  constructor(options: RuntimeWorkerOptions) {
    if (options.credentials.length === 0)
      throw new Error("En az bir runtime credential gereklidir.");
    const processingLanes = options.processingLanes ?? MAX_RUNTIME_PROCESSING_LANES;
    if (
      !Number.isInteger(processingLanes) ||
      processingLanes < 1 ||
      processingLanes > MAX_RUNTIME_PROCESSING_LANES
    )
      throw new Error("Runtime processing lane sayısı 1 veya 2 olmalıdır.");
    this.#options = options;
    this.#processingLanes = processingLanes;
    if (options.dailyPlanning && !options.credentials.includes(options.dailyPlanning.credential))
      throw new Error("Günlük plan credential'ı worker credential listesinde bulunmalıdır.");
  }

  async #tickDailyPlanning(): Promise<void> {
    const planning = this.#options.dailyPlanning;
    if (!planning) return;
    const now = this.#options.now?.() ?? new Date();
    const { dateKey, minuteOfDay } = istanbulPlanningClock(now);
    if (
      minuteOfDay < ISTANBUL_DAILY_PLAN_MINUTE ||
      this.#completedPlanningDateKey === dateKey ||
      now.getTime() < this.#planningRetryNotBefore
    )
      return;
    try {
      const result = await planning.controlPlane.planToday(
        planning.credential,
        this.#options.workerId,
      );
      if (result.localDate !== dateKey) throw new Error("DAILY_PLAN_DATE_MISMATCH");
      if (result.blocked) {
        this.#planningRetryNotBefore =
          now.getTime() + (this.#options.dailyPlanningRetryMs ?? DEFAULT_DAILY_PLANNING_RETRY_MS);
        this.#options.onSafeEvent?.({ level: "info", code: "DAILY_PLAN_BLOCKED" });
        return;
      }
      this.#completedPlanningDateKey = dateKey;
      this.#planningRetryNotBefore = 0;
      this.#options.onSafeEvent?.({ level: "info", code: "DAILY_PLAN_READY" });
    } catch {
      this.#planningRetryNotBefore =
        now.getTime() + (this.#options.dailyPlanningRetryMs ?? DEFAULT_DAILY_PLANNING_RETRY_MS);
      this.#options.onSafeEvent?.({ level: "error", code: "DAILY_PLAN_FAILED" });
    }
  }

  async #processCredential(credential: string): Promise<boolean> {
    const lease = await this.#options.controlPlane.lease(credential, this.#options.workerId);
    if (!lease.run) return false;
    const runId = lease.run.id;
    const leaseToken = lease.run.leaseToken;
    const deadline = new RuntimeRunDeadline(lease.run.startedAt, lease.run.timeoutSeconds);
    let runtimeStatus = "STARTING";
    let heartbeatInFlight: Promise<void> | null = null;
    const heartbeat = (): Promise<void> => {
      if (heartbeatInFlight) return heartbeatInFlight;
      if (deadline.signal.aborted) return Promise.resolve();
      heartbeatInFlight = this.#options.controlPlane
        .heartbeat(
          credential,
          this.#options.workerId,
          runId,
          leaseToken,
          runtimeStatus,
          deadline.requestOptions(),
        )
        .then(({ cancelRequested }) => {
          if (cancelRequested) deadline.requestCancel();
        })
        .catch((error: unknown) => {
          deadline.recordFailure(error);
        })
        .finally(() => {
          heartbeatInFlight = null;
        });
      return heartbeatInFlight;
    };
    const enterPhase = async (status: string) => {
      runtimeStatus = status;
      await heartbeat();
      deadline.throwIfStopped();
    };
    const heartbeatTimer = setInterval(
      () => void heartbeat(),
      this.#options.heartbeatIntervalMs ?? DEFAULT_RUNTIME_HEARTBEAT_INTERVAL_MS,
    );
    heartbeatTimer.unref();
    const codexIntervals: Array<{ startedAt: string; finishedAt: string; durationMs: number }> = [];
    const invokeCodex = async (
      request: Parameters<RuntimeProvider["invoke"]>[0],
    ): Promise<RuntimeProviderResult> => {
      if (codexIntervals.length >= 2) throw new Error("CODEX_INVOCATION_LIMIT_EXCEEDED");
      const startedAt = new Date();
      try {
        return await this.#options.provider.invoke(request);
      } finally {
        const finishedAt = new Date();
        codexIntervals.push({
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
        });
      }
    };
    let providerResult: RuntimeProviderResult | null = null;
    let sourceReads = 0;
    try {
      await enterPhase("STARTING");
      let context = await this.#options.controlPlane.context(
        credential,
        this.#options.workerId,
        runId,
        leaseToken,
        deadline.requestOptions(),
      );
      deadline.throwIfStopped();
      if (context.run.cancelRequested) {
        deadline.requestCancel();
        deadline.throwIfStopped();
      }
      if (context.run.allowSourceReading && this.#options.sourceReader) {
        await enterPhase("READING");
        const targets = z
          .array(
            z.object({
              sourceId: z.string().uuid(),
              url: z.string().url(),
            }),
          )
          .catch([])
          .parse(context.perception.sourceFetchTargets);
        const selectedTargets = targets.slice(
          0,
          sourceFetchTargetLimit(context.run.runType, context.run.sourceFetchLimit),
        );
        for (const target of selectedTargets) {
          deadline.throwIfStopped();
          const attemptId = crypto.randomUUID();
          await this.#options.controlPlane.recordSourceAttempt(
            credential,
            this.#options.workerId,
            runId,
            leaseToken,
            { attemptId, sourceId: target.sourceId },
            deadline.requestOptions(),
          );
          try {
            const items = await this.#options.sourceReader.read(target.url, {
              signal: deadline.signal,
              timeoutMs: Math.min(MAX_SOURCE_READ_TIMEOUT_MS, deadline.remainingMs()),
            });
            deadline.throwIfStopped();
            await this.#options.controlPlane.recordSourceResult(
              credential,
              this.#options.workerId,
              runId,
              leaseToken,
              { attemptId, sourceId: target.sourceId, items },
              deadline.requestOptions(),
            );
            sourceReads += items.length;
          } catch (error) {
            deadline.throwIfStopped();
            const message = error instanceof Error ? error.message : "SOURCE_FETCH_FAILED";
            const errorCode = /^SOURCE_[A-Z0-9_]+$/u.test(message)
              ? message
              : "SOURCE_FETCH_FAILED";
            await this.#options.controlPlane.recordSourceResult(
              credential,
              this.#options.workerId,
              runId,
              leaseToken,
              { attemptId, sourceId: target.sourceId, errorCode },
              deadline.requestOptions(),
            );
          }
        }
        if (selectedTargets.length > 0)
          context = await this.#options.controlPlane.context(
            credential,
            this.#options.workerId,
            runId,
            leaseToken,
            deadline.requestOptions(),
          );
      }
      await enterPhase("THINKING");
      const prompt = buildRuntimePrompt(context);
      const outputSchema = runtimeOutputJsonSchema(context);
      providerResult = await invokeCodex({
        runId,
        prompt,
        outputSchema,
        timeoutMs: deadline.remainingMs(),
        debugRetentionHours: context.run.debugRetentionHours,
        signal: deadline.signal,
      });
      deadline.throwIfStopped();
      await enterPhase("VALIDATING");
      let parsedDecision = parseDecisionForContext(context, providerResult.output);
      const reflectionOnly = context.run.runType === "REFLECTION";
      let decision = parsedDecision.success
        ? normalizedDecision(parsedDecision.data, { reflectionOnly })
        : null;
      const evidenceCatalog = runtimeEvidenceCatalog(context);
      if (
        !parsedDecision.success ||
        !decision ||
        !runtimeDecisionUsesCatalog(decision, evidenceCatalog)
      ) {
        const remainingMs = deadline.remainingMs();
        if (remainingMs < 1000) throw new RuntimeProviderTimeoutError();
        const repairResult = await invokeCodex({
          runId,
          prompt: `${prompt}\n\n${RUNTIME_STRUCTURED_REPAIR_INSTRUCTION}`,
          outputSchema,
          timeoutMs: remainingMs,
          debugRetentionHours: context.run.debugRetentionHours,
          signal: deadline.signal,
        });
        providerResult = {
          ...repairResult,
          durationMs: providerResult.durationMs + repairResult.durationMs,
        };
        parsedDecision = parseDecisionForContext(context, providerResult.output);
        decision = parsedDecision.success
          ? normalizedDecision(parsedDecision.data, { reflectionOnly })
          : null;
        deadline.throwIfStopped();
      }
      if (!parsedDecision.success) throw parsedDecision.error;
      if (!decision || !runtimeDecisionUsesCatalog(decision, evidenceCatalog))
        throw new Error("RUNTIME_PROVENANCE_CATALOG_INVALID");
      const consolidationRun = isMemoryConsolidationRun(context);
      const personaReflectionRun = isPersonaReflectionRun(context);
      await this.#options.controlPlane.recordActions(
        credential,
        this.#options.workerId,
        runId,
        leaseToken,
        decision.actions.map(actionForControlPlane),
        lifeEventsForDecision(decision),
        deadline.requestOptions(),
      );
      await enterPhase("EXECUTING");
      const executedActions: RuntimeExecution["actions"] = [];
      let contentRepairAttempted = false;
      const successfullyRepairedSequences = new Set<number>();
      let nextSequence = Math.max(0, ...decision.actions.map(({ sequence }) => sequence)) + 1;
      for (const originalAction of decision.actions) {
        await heartbeat();
        deadline.throwIfStopped();
        const execution = await this.#options.controlPlane.executeActions(
          credential,
          this.#options.workerId,
          runId,
          leaseToken,
          [originalAction.sequence],
          deadline.requestOptions(),
        );
        executedActions.push(...execution.actions);
        deadline.throwIfStopped();
        const repairableRejection = execution.actions.find(
          ({ actionStatus, rejectionCode }) =>
            actionStatus === "REJECTED" &&
            [
              "DUPLICATE_SIMILARITY",
              "DUPLICATE_FRAMING",
              "USER_ENTRY_HIGH_RISK_REPRODUCTION",
            ].includes(rejectionCode ?? ""),
        );
        if (repairableRejection && !contentRepairAttempted && codexIntervals.length < 2) {
          contentRepairAttempted = true;
          await enterPhase("VALIDATING");
          const repairResult = await invokeCodex({
            runId,
            prompt: buildContentRepairPrompt(
              prompt,
              originalAction,
              repairableRejection.rejectionCode ?? "",
            ),
            outputSchema,
            timeoutMs: deadline.remainingMs(),
            debugRetentionHours: context.run.debugRetentionHours,
            signal: deadline.signal,
          });
          providerResult = {
            ...repairResult,
            durationMs: providerResult.durationMs + repairResult.durationMs,
          };
          deadline.throwIfStopped();
          const repairDecision = parseDecisionForContext(context, repairResult.output);
          const repairDecisionData = repairDecision.success ? repairDecision.data : null;
          const repairCandidate = repairDecisionData
            ? safeContentRepairCandidate(originalAction, repairDecisionData, nextSequence)
            : null;
          if (repairCandidate && repairDecisionData) {
            nextSequence += 1;
            await this.#options.controlPlane.recordActions(
              credential,
              this.#options.workerId,
              runId,
              leaseToken,
              [actionForControlPlane(repairCandidate)],
              {
                observations: repairDecisionData.observations,
                memoryCandidates: repairDecisionData.memoryCandidates,
                decisionJournal: repairDecisionData.decisionJournal,
                actionIntents: [
                  {
                    sequence: repairCandidate.sequence,
                    desire: repairCandidate.desire,
                    expectedOutcome: repairCandidate.expectedOutcome,
                    selectedOptionSeq: repairCandidate.selectedOptionSeq,
                  },
                ],
              },
              deadline.requestOptions(),
            );
            await enterPhase("EXECUTING");
            const repairedExecution = await this.#options.controlPlane.executeActions(
              credential,
              this.#options.workerId,
              runId,
              leaseToken,
              [repairCandidate.sequence],
              deadline.requestOptions(),
            );
            executedActions.push(...repairedExecution.actions);
            if (repairedExecution.actions.some(({ actionStatus }) => actionStatus === "SUCCEEDED"))
              successfullyRepairedSequences.add(originalAction.sequence);
            deadline.throwIfStopped();
          }
        }
      }
      const execution: RuntimeExecution = {
        actions: executedActions.filter(
          ({ sequence, actionStatus }) =>
            !(
              successfullyRepairedSequences.has(sequence) &&
              ["REJECTED", "FAILED"].includes(actionStatus)
            ),
        ),
      };
      const measured = measuredExecution(execution);
      if (consolidationRun && decision.memoryConsolidations.length > 0) {
        await enterPhase("REFLECTING");
        await this.#options.controlPlane.recordMemories(
          credential,
          this.#options.workerId,
          runId,
          leaseToken,
          decision.memoryConsolidations,
          deadline.requestOptions(),
        );
      }
      deadline.throwIfStopped();
      await this.#options.controlPlane.complete(
        credential,
        this.#options.workerId,
        runId,
        leaseToken,
        {
          outcome: measured.rejected.length > 0 ? "PARTIAL" : "SUCCEEDED",
          safeRunSummary: {
            ...decision.safeRunSummary,
            proposedActionCount: executedActions.length,
            completedActionCount: measured.succeeded.length + measured.skipped.length,
            rejectedActionCount: measured.rejected.length,
          },
          usageMetadata: {
            durationMs: providerResult.durationMs,
            provider: providerResult.provider,
            model: providerResult.version,
            promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
            codexIntervals,
            ...providerResult.hostMetrics,
          },
          performanceMetrics: {
            publishedEntries: measured.publishedEntries,
            createdTopics: measured.createdTopics,
            votes: measured.votes,
            sourceReads,
          },
          state: decision.state,
          reflectionDelta: personaReflectionRun ? decision.reflectionDelta : null,
        },
        deadline.requestOptions(),
      );
      this.#options.onSafeEvent?.({ level: "info", code: "RUN_COMPLETED", runId });
      return true;
    } catch (rawError) {
      const error = deadline.normalizeError(rawError);
      const timeoutOccurredInCodex = ["THINKING", "VALIDATING"].includes(runtimeStatus);
      const failure =
        error instanceof RuntimeProviderCancelledError
          ? {
              outcome: "CANCELLED",
              errorCode: "WORKER_CANCELLED",
              errorSummary: "Run iptal isteği üzerine güvenli biçimde durduruldu.",
            }
          : error instanceof RuntimeProviderTimeoutError
            ? {
                outcome: "TIMED_OUT",
                errorCode: timeoutOccurredInCodex ? "CODEX_TIMEOUT" : "RUNTIME_TIMEOUT",
                errorSummary: timeoutOccurredInCodex
                  ? "Codex CLI run zaman aşımına uğradı."
                  : "Runtime mutlak deadline süresine ulaştı.",
              }
            : {
                outcome: "FAILED",
                errorCode: "WORKER_EXECUTION_FAILED",
                errorSummary: "Runtime worker run'ı güvenli biçimde tamamlayamadı.",
              };
      const failureUsage =
        codexIntervals.length > 0
          ? {
              durationMs:
                providerResult?.durationMs ??
                codexIntervals.reduce((sum, interval) => sum + interval.durationMs, 0),
              provider: providerResult?.provider ?? ("codex-cli" as const),
              ...(providerResult ? { model: providerResult.version } : {}),
              promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
              codexIntervals,
              ...(providerResult?.hostMetrics ?? {}),
            }
          : null;
      await this.#options.controlPlane.fail(credential, this.#options.workerId, runId, leaseToken, {
        ...failure,
        ...(failureUsage ? { usageMetadata: failureUsage } : {}),
      });
      this.#options.onSafeEvent?.({ level: "error", code: failure.errorCode, runId });
      return true;
    } finally {
      clearInterval(heartbeatTimer);
      deadline.close();
    }
  }

  async #runCredentialLanes(): Promise<number> {
    let cursor = 0;
    let processed = 0;
    const laneFailures: unknown[] = [];
    const processLane = async () => {
      while (laneFailures.length === 0 && cursor < this.#options.credentials.length) {
        const credential = this.#options.credentials[cursor];
        cursor += 1;
        try {
          if (credential && (await this.#processCredential(credential))) processed += 1;
        } catch (error) {
          laneFailures.push(error);
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(this.#processingLanes, this.#options.credentials.length) },
        processLane,
      ),
    );
    if (laneFailures.length > 0) throw laneFailures[0];
    return processed;
  }

  async runOnce(): Promise<number> {
    if (this.#runOnceInFlight) return this.#runOnceInFlight;
    const execution = (async () => {
      await this.#tickDailyPlanning();
      return this.#runCredentialLanes();
    })();
    this.#runOnceInFlight = execution;
    try {
      return await execution;
    } finally {
      if (this.#runOnceInFlight === execution) this.#runOnceInFlight = null;
    }
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const processed = await this.runOnce();
      if (processed === 0)
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, this.#options.pollIntervalMs ?? 5000);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
    }
  }
}
