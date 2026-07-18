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
  recordRuntimeActions,
  recordRuntimeMemories,
  recordRuntimeSourceResult,
  runtimeActionsSchema,
  runtimeCompleteSchema,
  runtimeFailSchema,
  runtimeHeartbeatSchema,
  runtimeMemoriesSchema,
  runtimeSourceResultSchema,
} from "@/modules/agents";
import type { RuntimeControlPlane, RuntimeExecution } from "@/runtime/control-plane-client";
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

  async context(credential: string, workerId: string, runId: string) {
    return getRuntimeRunContext(
      this.#database,
      await principal(this.#database, credential, "runtime:read"),
      runId,
      workerId,
    );
  }

  async heartbeat(credential: string, workerId: string, runId: string, runtimeStatus: string) {
    const parsed = runtimeHeartbeatSchema.parse({
      runId,
      workerId,
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
    actions: unknown[],
  ): Promise<void> {
    await recordRuntimeActions(
      this.#database,
      await principal(this.#database, credential, "runtime:write"),
      runId,
      runtimeActionsSchema.parse({ workerId, actions }),
    );
  }

  async executeActions(
    credential: string,
    workerId: string,
    runId: string,
    sequences: number[],
  ): Promise<RuntimeExecution> {
    const runtimePrincipal = await principal(this.#database, credential, "runtime:write");
    const actions = [];
    for (const sequence of sequences)
      actions.push(
        await executeRuntimeAction(this.#database, runtimePrincipal, runId, {
          workerId,
          sequence,
        }),
      );
    return { actions };
  }

  async recordMemories(
    credential: string,
    workerId: string,
    runId: string,
    memories: unknown[],
  ): Promise<void> {
    await recordRuntimeMemories(
      this.#database,
      await principal(this.#database, credential, "runtime:write"),
      runId,
      runtimeMemoriesSchema.parse({ workerId, memories }),
    );
  }

  async recordSourceResult(
    credential: string,
    workerId: string,
    runId: string,
    result: Record<string, unknown>,
  ): Promise<void> {
    await recordRuntimeSourceResult(
      this.#database,
      await principal(this.#database, credential, "runtime:write"),
      runId,
      runtimeSourceResultSchema.parse({ workerId, ...result }),
    );
  }

  async complete(
    credential: string,
    workerId: string,
    runId: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    await completeRuntimeRun(
      this.#database,
      await principal(this.#database, credential, "runtime:write"),
      runId,
      runtimeCompleteSchema.parse({ workerId, ...input }),
    );
  }

  async fail(
    credential: string,
    workerId: string,
    runId: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    await failRuntimeRun(
      this.#database,
      await principal(this.#database, credential, "runtime:write"),
      runId,
      runtimeFailSchema.parse({ workerId, ...input }),
    );
  }
}

interface PromptContext {
  run: { id: string; desiredEntryMax: number; publishEnabled: boolean };
  agent: { profileId: string; username: string };
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
  #forcedTopicId: string | null = null;

  forceNextTopic(topicId: string): void {
    this.#forcedTopicId = topicId;
  }

  async inspect() {
    return { version: "fake-codex-simulation-1", supportsStructuredOutput: true };
  }

  async invoke(request: RuntimeProviderRequest) {
    const context = parsePromptContext(request.prompt);
    const profileId = context.agent.profileId;
    const invocation = this.#invocations.get(profileId) ?? 0;
    this.#invocations.set(profileId, invocation + 1);
    if (!this.#agentIndexes.has(profileId))
      this.#agentIndexes.set(profileId, this.#agentIndexes.size);
    const agentIndex = this.#agentIndexes.get(profileId)!;
    const visibleTopicIds = [
      ...new Set(
        (context.perception.recentEntries ?? []).flatMap(({ topic }) =>
          topic?.id ? [topic.id] : [],
        ),
      ),
    ];
    if (visibleTopicIds.length === 0 && !this.#forcedTopicId)
      throw new Error("SIMULATION_VISIBLE_TOPIC_MISSING");
    const entryCount = context.run.publishEnabled ? context.run.desiredEntryMax : 0;
    const forcedTopicId = this.#forcedTopicId;
    this.#forcedTopicId = null;
    const actions = Array.from({ length: entryCount }, (_, index) => {
      const topicId =
        forcedTopicId ??
        visibleTopicIds[(agentIndex * 7 + invocation * 3 + index) % visibleTopicIds.length]!;
      return {
        sequence: index + 1,
        actionType: "CREATE_ENTRY" as const,
        targetType: "TOPIC",
        targetId: topicId,
        input: {
          topicId,
          body: `Simülasyon kaydı ${context.run.id}-${index + 1}-${topicId}: ${context.agent.username} bu başlıktaki ölçü, zamanlama ve bağlam ayrımlarını birlikte değerlendiriyor.`,
        },
        provenance: {
          evidenceType: "PLATFORM_EVENT" as const,
          evidenceIds: [topicId],
          shortRationale: "Görünür platform topic bağlamından üretilen simülasyon girdisi.",
        },
      };
    });
    return {
      provider: "codex-cli" as const,
      version: "fake-codex-simulation-1",
      durationMs: 1000,
      output: {
        state: { curiosity: 0.6, confidence: 0.8, topicFatigue: {} },
        observations: [],
        actions,
        beliefDeltas: [],
        relationshipDeltas: [],
        sourceProposals: [],
        memoryCandidates: [],
        safeRunSummary: {
          operationSummary: "Hızlandırılmış günlük simülasyon run'ı işlendi.",
          observedItemIds: [],
          shortRationale: "Scheduler hedefi kadar benzersiz entry action'ı önerildi.",
        },
      },
    };
  }
}
