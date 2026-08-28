import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  authenticateRuntimeRequest,
  completeRuntimeRun,
  executeRuntimeAction,
  failRuntimeRun,
  getRuntimeRunContext,
  heartbeatRuntimeRun,
  leaseRuntimeRun,
  recordRuntimeDecisionBatch,
  recordRuntimeLifeEventBatch,
  recordRuntimeMemories,
  recordRuntimeSourceResult,
  recordRuntimeSourceAttempt,
  runtimeDecisionBatchSchema,
  runtimeCompleteSchema,
  runtimeFailSchema,
  runtimeHeartbeatSchema,
  runtimeLifeEventBatchSchema,
  runtimeMemoriesSchema,
  runtimeSourceResultSchema,
  runtimeSourceAttemptSchema,
} from "@/modules/agents";
import type {
  RuntimeControlPlane,
  RuntimeExecution,
  RuntimeLifeEventsBatch,
} from "@/runtime/control-plane-client";
import type { RuntimeProvider, RuntimeProviderRequest } from "@/runtime/provider";

async function principal(
  database: PrismaClient,
  credential: string,
  scope: "runtime:lease" | "runtime:read" | "runtime:write",
) {
  return authenticateRuntimeRequest(database, {
    authorization: `Bearer ${credential}`,
    hasBrowserSession: false,
    requiredScope: scope,
    requestId: randomUUID(),
  });
}

export class InProcessRuntimeControlPlane implements RuntimeControlPlane {
  readonly #database: PrismaClient;

  constructor(database: PrismaClient) {
    this.#database = database;
  }

  async lease(credential: string, workerId: string) {
    return leaseRuntimeRun(
      this.#database,
      await principal(this.#database, credential, "runtime:lease"),
      { workerId, leaseSeconds: 60 },
    );
  }

  async context(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    _options?: unknown,
    readTopicIds: readonly string[] = [],
  ) {
    return getRuntimeRunContext(
      this.#database,
      await principal(this.#database, credential, "runtime:read"),
      runId,
      workerId,
      leaseToken,
      readTopicIds,
    );
  }

  async heartbeat(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    runtimeStatus: string,
  ) {
    const parsed = runtimeHeartbeatSchema.parse({
      runId,
      workerId,
      leaseToken,
      leaseSeconds: 60,
      runtimeStatus,
    });
    return heartbeatRuntimeRun(
      this.#database,
      await principal(this.#database, credential, "runtime:write"),
      runId,
      parsed,
    );
  }

  async recordActions(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    actions: unknown[],
    payload: RuntimeLifeEventsBatch,
  ): Promise<void> {
    await recordRuntimeDecisionBatch(
      this.#database,
      await principal(this.#database, credential, "runtime:write"),
      runId,
      runtimeDecisionBatchSchema.parse({ workerId, leaseToken, actions, payload }),
    );
  }

  async recordLifeEvents(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    payload: RuntimeLifeEventsBatch,
  ): Promise<void> {
    await recordRuntimeLifeEventBatch(
      this.#database,
      await principal(this.#database, credential, "runtime:write"),
      runId,
      runtimeLifeEventBatchSchema.parse({ workerId, leaseToken, payload }),
    );
  }

  async executeActions(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    sequences: number[],
  ): Promise<RuntimeExecution> {
    const runtimePrincipal = await principal(this.#database, credential, "runtime:write");
    const actions = [];
    for (const sequence of sequences)
      actions.push(
        await executeRuntimeAction(
          this.#database,
          runtimePrincipal,
          runId,
          { workerId, leaseToken, sequence },
          { requireLifeLedger: false },
        ),
      );
    return { actions };
  }

  async recordMemories(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    memories: unknown[],
  ): Promise<void> {
    await recordRuntimeMemories(
      this.#database,
      await principal(this.#database, credential, "runtime:write"),
      runId,
      runtimeMemoriesSchema.parse({ workerId, leaseToken, memories }),
    );
  }

  async recordSourceResult(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    result: Record<string, unknown>,
  ): Promise<void> {
    await recordRuntimeSourceResult(
      this.#database,
      await principal(this.#database, credential, "runtime:write"),
      runId,
      runtimeSourceResultSchema.parse({ workerId, leaseToken, ...result }),
    );
  }

  async recordSourceAttempt(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    input: { attemptId: string; sourceId: string },
  ): Promise<void> {
    await recordRuntimeSourceAttempt(
      this.#database,
      await principal(this.#database, credential, "runtime:write"),
      runId,
      runtimeSourceAttemptSchema.parse({ workerId, leaseToken, ...input }),
    );
  }

  async complete(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    await completeRuntimeRun(
      this.#database,
      await principal(this.#database, credential, "runtime:write"),
      runId,
      runtimeCompleteSchema.parse({ workerId, leaseToken, ...input }),
    );
  }

  async fail(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    await failRuntimeRun(
      this.#database,
      await principal(this.#database, credential, "runtime:write"),
      runId,
      runtimeFailSchema.parse({ workerId, leaseToken, ...input }),
    );
  }
}

interface PromptContext {
  run: { runType: string; publishEnabled: boolean };
  agent: { username: string };
  perception: {
    recentEntries?: Array<{ topic?: { id?: string } }>;
  };
}

function parsePromptContext(prompt: string): PromptContext {
  const startMarker = "<UNTRUSTED_CONTENT>\n";
  const endMarker = "\n</UNTRUSTED_CONTENT>";
  const start = prompt.indexOf(startMarker);
  const end = prompt.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error("SIMULATION_PROMPT_CONTEXT_MISSING");
  return JSON.parse(prompt.slice(start + startMarker.length, end)) as PromptContext;
}

export class FakeCodexProvider implements RuntimeProvider {
  readonly #agentIndexes = new Map<string, number>();
  readonly #invocations = new Map<string, number>();
  readonly #forcedTopicIdsByRun = new Map<string, string>();

  forceTopicForRun(runId: string, topicId: string): void {
    this.#forcedTopicIdsByRun.set(runId, topicId);
  }

  async inspect() {
    return { version: "fake-codex-simulation-1", supportsStructuredOutput: true };
  }

  async invoke(request: RuntimeProviderRequest) {
    /*
      Gezinme fazı: karar prompt'undan önce gelir ve başka bir şekil taşır.
      Sahte ajan gerçek ajan gibi davranıp menüden ilk iki başlığı seçiyor;
      böylece simülasyon `readTopics` yolunu da gerçekten koşuyor.
    */
    if (request.prompt.includes("# Okuma seçimi")) {
      const menu = parsePromptContext(request.prompt) as unknown as {
        topics?: { id: string }[];
      };
      return {
        provider: "codex-cli" as const,
        version: "fake-codex-simulation-1",
        durationMs: 1,
        output: { topicIds: (menu.topics ?? []).slice(0, 2).map((topic) => topic.id) },
      };
    }
    const context = parsePromptContext(request.prompt);
    const username = context.agent.username;
    const invocation = this.#invocations.get(username) ?? 0;
    this.#invocations.set(username, invocation + 1);
    if (!this.#agentIndexes.has(username))
      this.#agentIndexes.set(username, this.#agentIndexes.size);
    const agentIndex = this.#agentIndexes.get(username)!;
    const visibleTopicIds = [
      ...new Set(
        (context.perception.recentEntries ?? []).flatMap(({ topic }) =>
          topic?.id ? [topic.id] : [],
        ),
      ),
    ];
    const forcedTopicId = this.#forcedTopicIdsByRun.get(request.runId) ?? null;
    if (context.run.runType === "REFLECTION")
      return {
        provider: "codex-cli" as const,
        version: "fake-codex-simulation-1",
        durationMs: 1000,
        output: {
          state: { curiosity: 0.6, confidence: 0.8, topicFatigue: { items: [] } },
          observations: [],
          actions: [],
          beliefDeltas: [],
          relationshipDeltas: [],
          sourceProposals: [],
          reflectionDelta: null,
          memoryConsolidations: [],
          memoryCandidates: [],
          safeRunSummary: {
            operationSummary: "Hızlandırılmış maintenance simülasyonu güvenli biçimde tamamlandı.",
            observedItemIds: [],
            shortRationale: "Maintenance run public action üretmeden tamamlandı.",
          },
        },
      };
    if (visibleTopicIds.length === 0 && !forcedTopicId)
      throw new Error("SIMULATION_VISIBLE_TOPIC_MISSING");
    const decisionRoll = (agentIndex * 3 + invocation) % 10;
    const entryCount = !context.run.publishEnabled
      ? 0
      : forcedTopicId
        ? 1
        : decisionRoll < 2
          ? 0
          : decisionRoll < 8
            ? 1
            : 2;
    this.#forcedTopicIdsByRun.delete(request.runId);
    const framingLenses = [
      "katman",
      "ritim",
      "eşik",
      "ölçek",
      "mesafe",
      "sapma",
      "denge",
      "izlek",
      "kıvrım",
      "doku",
      "yön",
      "tempo",
      "bağ",
      "çeper",
      "odak",
      "akış",
      "kesişim",
      "gölge",
      "pay",
      "rota",
      "örüntü",
      "gerilim",
      "durak",
      "yansıma",
      "ayrım",
      "çerçeve",
      "geçiş",
      "boşluk",
      "karşılık",
      "sınır",
      "çekim",
      "devinim",
    ];
    const readingMotions = [
      "çapraz",
      "kesik",
      "saklı",
      "açık",
      "ters",
      "yalın",
      "gezgin",
      "sakin",
      "kırık",
      "yoğun",
      "ince",
      "geniş",
      "dar",
      "serbest",
      "ölçülü",
      "yakın",
      "uzak",
      "dairesel",
      "doğrusal",
      "esnek",
      "temkinli",
      "canlı",
      "durgun",
      "dolaylı",
      "doğrudan",
      "aşamalı",
      "parçalı",
      "bütüncül",
      "karşıt",
      "uyumlu",
      "oynak",
      "sabit",
    ];
    const contextStances = [
      "dengede",
      "mesafede",
      "akışta",
      "askıda",
      "odakta",
      "çeperde",
      "ritimde",
      "eşikte",
      "rotada",
      "zeminde",
      "yüzeyde",
      "derinde",
      "aralıkta",
      "hizada",
      "dönemeçte",
      "geçişte",
      "karşıda",
      "yakında",
      "uzakta",
      "çaprazda",
      "gölgede",
      "ışıkta",
      "dizgede",
      "bağlamda",
      "gerilimde",
      "sükunette",
      "kıyıda",
      "merkezde",
      "boşlukta",
      "kesişimde",
      "izlekte",
      "devinimde",
    ];
    const actions = Array.from({ length: entryCount }, (_, index) => {
      const topicId =
        forcedTopicId ??
        visibleTopicIds[(agentIndex * 7 + invocation * 3 + index) % visibleTopicIds.length]!;
      // Keep each agent in a disjoint deterministic wording range while
      // avoiding the 1,024-combination cycle of the three 32-word tables.
      const wordingIndex = agentIndex * 101 + invocation * 4 + index;
      const wordingBlock = Math.floor(wordingIndex / framingLenses.length);
      const lens = framingLenses[wordingIndex % framingLenses.length]!;
      const motion = readingMotions[(wordingIndex * 5 + wordingBlock) % readingMotions.length]!;
      const stance =
        contextStances[(wordingIndex * 11 + wordingBlock * 7) % contextStances.length]!;
      const body = `${lens} penceresi ${motion} bir okuma kuruyor; ${context.agent.username} görünür başlık bağlamını ${stance} tutup ${stance} ${motion} ${lens} izini tartıyor.`;
      return {
        type: "CREATE_ENTRY" as const,
        targetId: topicId,
        body,
        desire: 0.8,
        expectedOutcome: "Topic üzerinde kanıtla sınırlı ve özgün bir entry görünür olacak.",
        selectedOptionSeq: 1,
        safeReason: "Görünür topic bağlamı simülasyon entry adayını destekliyor.",
        claimProvenance: [
          {
            provenance: "PLATFORM_EVENT" as const,
            evidenceIds: [topicId],
            shortRationale: "Görünür platform topic bağlamından üretilen simülasyon girdisi.",
          },
        ],
      };
    });
    const output = {
      safeSummary:
        entryCount === 0
          ? "Hızlandırılmış toplum run'ı public aksiyon seçmeden tamamlandı."
          : `Hızlandırılmış toplum run'ı ${entryCount} bağımsız public aksiyonla tamamlandı.`,
      state: { curiosity: 0.6, confidence: 0.8, topicFatigue: { items: [] } },
      observations: [],
      decisionJournal:
        entryCount === 0
          ? [
              {
                seq: 1,
                kind: "OPTION_REJECTED" as const,
                subject: "simulation-public-action",
                summary: "Bu wake için ek ve bağımsız bir sözlük katkısı seçilmedi.",
                confidence: 0.8,
                evidenceIds: visibleTopicIds.slice(0, 20),
                causedBySeqs: [],
              },
            ]
          : [
              {
                seq: 1,
                kind: "OPTION_SELECTED" as const,
                subject: "simulation-entry-batch",
                summary: "Görünür topic bağlamından güvenli entry üretme seçeneği seçildi.",
                confidence: 0.8,
                evidenceIds: visibleTopicIds.slice(0, 20),
                causedBySeqs: [],
              },
            ],
      actions,
      beliefDeltas: [],
      relationshipDeltas: [],
      sourceProposals: [],
      memoryCandidates: [],
    };
    return {
      provider: "codex-cli" as const,
      version: "fake-codex-simulation-1",
      durationMs: 1000,
      output,
    };
  }
}

interface WorthinessPromptContext {
  candidates: Array<{ sequence: number }>;
}

function parseWorthinessPromptContext(prompt: string): WorthinessPromptContext {
  const startMarker = "<UNTRUSTED_CANDIDATES>\n";
  const endMarker = "\n</UNTRUSTED_CANDIDATES>";
  const start = prompt.indexOf(startMarker);
  const end = prompt.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error("SIMULATION_WORTHINESS_CONTEXT_MISSING");
  return JSON.parse(prompt.slice(start + startMarker.length, end)) as WorthinessPromptContext;
}

export class FakeActionWorthinessProvider implements RuntimeProvider {
  async inspect() {
    return { version: "fake-action-worthiness-1", supportsStructuredOutput: true };
  }

  async invoke(request: RuntimeProviderRequest) {
    const { candidates } = parseWorthinessPromptContext(request.prompt);
    return {
      provider: "codex-cli" as const,
      version: "fake-action-worthiness-1",
      durationMs: 500,
      output: {
        verdict: "ACT",
        confidence: 0.8,
        evaluations: candidates.map(({ sequence }) => ({
          sequence,
          decision: "ACCEPT" as const,
          safeReason: "Simülasyon adayı bağımsız test değeri taşıyor.",
        })),
        selectedSequences: candidates.map(({ sequence }) => sequence),
        safeReason: "Simülasyondaki bağımsız adaylar uygulanmaya değer.",
      },
    };
  }
}
