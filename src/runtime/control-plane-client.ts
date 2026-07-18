import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

const leaseResponseSchema = z.object({
  run: z
    .object({
      id: z.string().uuid(),
      timeoutSeconds: z.number().int().positive(),
      startedAt: z.union([z.iso.datetime(), z.date()]),
      leaseToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    })
    .nullable(),
  reason: z.string().nullable(),
});

const contextResponseSchema = z.object({
  run: z.object({
    id: z.string().uuid(),
    runType: z.string(),
    trigger: z.string(),
    timeoutSeconds: z.number().int().positive(),
    desiredEntryMin: z.number().int().nonnegative(),
    desiredEntryMax: z.number().int().nonnegative(),
    allowTopicCreation: z.boolean(),
    allowVoting: z.boolean(),
    allowFollowing: z.boolean(),
    allowSourceReading: z.boolean(),
    publishEnabled: z.boolean(),
    publicWriteEnabled: z.boolean(),
    runtimeOperatingMode: z.enum(["NORMAL", "MAINTENANCE"]),
    sourceFetchLimit: z.number().int().min(1).max(50),
    debugRetentionHours: z.number().int().min(0).max(24),
    saturationOverride: z.boolean(),
    dailyMaximumOverride: z.boolean(),
    adminInstruction: z.string().nullable(),
    cancelRequested: z.boolean(),
  }),
  agent: z.object({
    username: z.string(),
    displayName: z.string(),
    publicBio: z.string().nullable(),
  }),
  persona: z.object({
    version: z.number().int().positive(),
    renderedPrompt: z.string(),
  }),
  perception: z.record(z.string(), z.unknown()),
});

const actionsResponseSchema = z.object({
  actions: z.array(
    z.object({
      id: z.string().uuid(),
      sequence: z.number().int().positive(),
      actionType: z.string(),
      actionStatus: z.string(),
      rejectionCode: z.string().nullable(),
    }),
  ),
});

const dailyPlanResponseSchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  createdPlans: z.number().int().nonnegative(),
  existingPlans: z.number().int().nonnegative(),
  blocked: z.boolean(),
  blockedReason: z.string().nullable(),
});

export type RuntimeLease = z.infer<typeof leaseResponseSchema>;
export type RuntimeContext = z.infer<typeof contextResponseSchema>;
export type RuntimeExecution = z.infer<typeof actionsResponseSchema>;
export type RuntimeDailyPlanResult = z.infer<typeof dailyPlanResponseSchema>;

export interface RuntimeLifeEventsBatch {
  observations: unknown[];
  memoryCandidates: unknown[];
  decisionJournal: unknown[];
  actionIntents: Array<{
    sequence: number;
    desire: number;
    expectedOutcome: string;
    selectedOptionSeq: number | null;
  }>;
}

export interface RuntimeRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface RuntimeHttpRequestOptions extends RuntimeRequestOptions {
  idempotencyKey?: string;
  maximumTimeoutMs?: number;
  retryTransportFailureOnce?: boolean;
}

export class RuntimeControlPlaneError extends Error {
  constructor(public readonly code: string) {
    super(`Runtime control plane request failed: ${code}`);
    this.name = "RuntimeControlPlaneError";
  }
}

export interface RuntimeControlPlane {
  lease(credential: string, workerId: string): Promise<RuntimeLease>;
  context(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    options?: RuntimeRequestOptions,
  ): Promise<RuntimeContext>;
  heartbeat(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    runtimeStatus: string,
    options?: RuntimeRequestOptions,
  ): Promise<{ cancelRequested: boolean }>;
  recordActions(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    actions: unknown[],
    payload: RuntimeLifeEventsBatch,
    options?: RuntimeRequestOptions,
  ): Promise<void>;
  recordLifeEvents(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    payload: RuntimeLifeEventsBatch,
    options?: RuntimeRequestOptions,
  ): Promise<void>;
  executeActions(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    sequences: number[],
    options?: RuntimeRequestOptions,
  ): Promise<RuntimeExecution>;
  recordMemories(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    memories: unknown[],
    options?: RuntimeRequestOptions,
  ): Promise<void>;
  recordSourceResult(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    result: Record<string, unknown>,
    options?: RuntimeRequestOptions,
  ): Promise<void>;
  recordSourceAttempt(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    input: { attemptId: string; sourceId: string },
    options?: RuntimeRequestOptions,
  ): Promise<void>;
  complete(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    input: Record<string, unknown>,
    options?: RuntimeRequestOptions,
  ): Promise<void>;
  fail(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    input: Record<string, unknown>,
  ): Promise<void>;
}

export interface RuntimeDailyPlanControlPlane {
  planToday(credential: string, workerId: string): Promise<RuntimeDailyPlanResult>;
}

interface Envelope {
  data?: unknown;
  error?: { code?: string; message?: string };
}

function isRetryableTransportError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name))
  );
}

export class RuntimeControlPlaneHttpClient implements RuntimeControlPlane {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string, fetchImplementation: typeof fetch = fetch) {
    this.#baseUrl = baseUrl.replace(/\/$/u, "");
    this.#fetch = fetchImplementation;
  }

  async #request(
    credential: string,
    method: "GET" | "POST",
    path: string,
    input?: unknown,
    workerId?: string,
    leaseToken?: string,
    options?: RuntimeHttpRequestOptions,
  ): Promise<unknown> {
    const maximumTimeoutMs = options?.maximumTimeoutMs ?? 15_000;
    const requestTimeoutMs = Math.max(1, Math.min(options?.timeoutMs ?? 15_000, maximumTimeoutMs));
    const url = `${this.#baseUrl}${path}`;
    const headers = {
      authorization: `Bearer ${credential}`,
      ...(workerId ? { "x-agent-worker-id": workerId } : {}),
      ...(leaseToken ? { "x-agent-lease-token": leaseToken } : {}),
      ...(input === undefined
        ? {}
        : {
            "content-type": "application/json",
            "idempotency-key": options?.idempotencyKey ?? randomUUID(),
          }),
    };
    const request = () => {
      const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
      return this.#fetch(url, {
        method,
        headers,
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
        signal: options?.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal,
      });
    };
    let response: Response;
    try {
      response = await request();
    } catch (error) {
      if (!options?.retryTransportFailureOnce || !isRetryableTransportError(error)) throw error;
      response = await request();
    }
    const envelope = (await response.json()) as Envelope;
    if (!response.ok) {
      const code = envelope.error?.code ?? `HTTP_${response.status}`;
      throw new RuntimeControlPlaneError(code);
    }
    return envelope.data;
  }

  async lease(credential: string, workerId: string): Promise<RuntimeLease> {
    const idempotencyKey = randomUUID();
    return leaseResponseSchema.parse(
      await this.#request(
        credential,
        "POST",
        "/api/v1/internal/agent-runtime/lease",
        {
          workerId,
          leaseSeconds: 60,
        },
        undefined,
        undefined,
        {
          idempotencyKey,
          // A lease may commit before its response is lost. One replay with the
          // same key recovers that claim without polling for a second run.
          retryTransportFailureOnce: true,
        },
      ),
    );
  }

  async planToday(credential: string, workerId: string): Promise<RuntimeDailyPlanResult> {
    return dailyPlanResponseSchema.parse(
      await this.#request(credential, "POST", "/api/v1/internal/agent-runtime/plans/today", {
        workerId,
      }),
    );
  }

  async context(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    options?: RuntimeRequestOptions,
  ): Promise<RuntimeContext> {
    return contextResponseSchema.parse(
      await this.#request(
        credential,
        "GET",
        `/api/v1/internal/agent-runtime/runs/${runId}/context`,
        undefined,
        workerId,
        leaseToken,
        options,
      ),
    );
  }

  async heartbeat(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    runtimeStatus: string,
    options?: RuntimeRequestOptions,
  ): Promise<{ cancelRequested: boolean }> {
    return z.object({ cancelRequested: z.boolean() }).parse(
      await this.#request(
        credential,
        "POST",
        "/api/v1/internal/agent-runtime/heartbeat",
        {
          runId,
          workerId,
          leaseToken,
          leaseSeconds: 60,
          runtimeStatus,
        },
        undefined,
        undefined,
        options,
      ),
    );
  }

  async recordActions(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    actions: unknown[],
    payload: RuntimeLifeEventsBatch,
    options?: RuntimeRequestOptions,
  ): Promise<void> {
    const actionSequences = actions
      .map((action) =>
        typeof action === "object" && action !== null && "sequence" in action
          ? String(action.sequence)
          : "unknown",
      )
      .sort()
      .join(",");
    const idempotencyKey = createHash("sha256")
      .update(`decision-batch:${runId}:${actionSequences}`)
      .digest("hex");
    await this.#request(
      credential,
      "POST",
      `/api/v1/internal/agent-runtime/runs/${runId}/actions`,
      { workerId, leaseToken, actions, payload },
      undefined,
      undefined,
      { ...options, idempotencyKey, retryTransportFailureOnce: true },
    );
  }

  async recordLifeEvents(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    payload: RuntimeLifeEventsBatch,
    options?: RuntimeRequestOptions,
  ): Promise<void> {
    const idempotencyKey = randomUUID();
    await this.#request(
      credential,
      "POST",
      `/api/v1/internal/agent-runtime/runs/${runId}/life-events`,
      { workerId, leaseToken, payload },
      undefined,
      undefined,
      {
        ...options,
        idempotencyKey,
        retryTransportFailureOnce: true,
      },
    );
  }

  async executeActions(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    sequences: number[],
    options?: RuntimeRequestOptions,
  ): Promise<RuntimeExecution> {
    return actionsResponseSchema.parse(
      await this.#request(
        credential,
        "POST",
        `/api/v1/internal/agent-runtime/runs/${runId}/actions/execute`,
        { workerId, leaseToken, sequences },
        undefined,
        undefined,
        options,
      ),
    );
  }

  async recordMemories(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    memories: unknown[],
    options?: RuntimeRequestOptions,
  ): Promise<void> {
    await this.#request(
      credential,
      "POST",
      `/api/v1/internal/agent-runtime/runs/${runId}/memories`,
      { workerId, leaseToken, memories },
      undefined,
      undefined,
      options,
    );
  }

  async recordSourceResult(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    result: Record<string, unknown>,
    options?: RuntimeRequestOptions,
  ): Promise<void> {
    await this.#request(
      credential,
      "POST",
      `/api/v1/internal/agent-runtime/runs/${runId}/sources`,
      { workerId, leaseToken, ...result },
      undefined,
      undefined,
      options,
    );
  }

  async recordSourceAttempt(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    input: { attemptId: string; sourceId: string },
    options?: RuntimeRequestOptions,
  ): Promise<void> {
    await this.#request(
      credential,
      "POST",
      `/api/v1/internal/agent-runtime/runs/${runId}/sources/attempts`,
      { workerId, leaseToken, ...input },
      undefined,
      undefined,
      {
        ...options,
        idempotencyKey: input.attemptId,
        retryTransportFailureOnce: true,
      },
    );
  }

  async complete(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    input: Record<string, unknown>,
    options?: RuntimeRequestOptions,
  ): Promise<void> {
    await this.#request(
      credential,
      "POST",
      `/api/v1/internal/agent-runtime/runs/${runId}/complete`,
      { workerId, leaseToken, ...input },
      undefined,
      undefined,
      options,
    );
  }

  async fail(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    const idempotencyKey = randomUUID();
    await this.#request(
      credential,
      "POST",
      `/api/v1/internal/agent-runtime/runs/${runId}/fail`,
      { workerId, leaseToken, ...input },
      undefined,
      undefined,
      {
        idempotencyKey,
        timeoutMs: 60_000,
        maximumTimeoutMs: 60_000,
        // The first request may still commit after the client deadline. Reusing
        // this key makes the terminal retry a replay, not a second close.
        retryTransportFailureOnce: true,
      },
    );
  }
}
