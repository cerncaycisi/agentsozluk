import { randomUUID } from "node:crypto";
import { z } from "zod";

const leaseResponseSchema = z.object({
  run: z
    .object({
      id: z.string().uuid(),
      timeoutSeconds: z.number().int().positive(),
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
    adminInstruction: z.string().nullable(),
    cancelRequested: z.boolean(),
  }),
  agent: z.object({
    profileId: z.string().uuid(),
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

export type RuntimeLease = z.infer<typeof leaseResponseSchema>;
export type RuntimeContext = z.infer<typeof contextResponseSchema>;
export type RuntimeExecution = z.infer<typeof actionsResponseSchema>;

export interface RuntimeControlPlane {
  lease(credential: string, workerId: string): Promise<RuntimeLease>;
  context(credential: string, workerId: string, runId: string): Promise<RuntimeContext>;
  heartbeat(
    credential: string,
    workerId: string,
    runId: string,
    runtimeStatus: string,
  ): Promise<{ cancelRequested: boolean }>;
  recordActions(
    credential: string,
    workerId: string,
    runId: string,
    actions: unknown[],
  ): Promise<void>;
  executeActions(
    credential: string,
    workerId: string,
    runId: string,
    sequences: number[],
  ): Promise<RuntimeExecution>;
  recordMemories(
    credential: string,
    workerId: string,
    runId: string,
    memories: unknown[],
  ): Promise<void>;
  recordSourceResult(
    credential: string,
    workerId: string,
    runId: string,
    result: Record<string, unknown>,
  ): Promise<void>;
  complete(
    credential: string,
    workerId: string,
    runId: string,
    input: Record<string, unknown>,
  ): Promise<void>;
  fail(
    credential: string,
    workerId: string,
    runId: string,
    input: Record<string, unknown>,
  ): Promise<void>;
}

interface Envelope {
  data?: unknown;
  error?: { code?: string; message?: string };
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
  ): Promise<unknown> {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${credential}`,
        ...(workerId ? { "x-agent-worker-id": workerId } : {}),
        ...(input === undefined
          ? {}
          : {
              "content-type": "application/json",
              "idempotency-key": randomUUID(),
            }),
      },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      signal: AbortSignal.timeout(15_000),
    });
    const envelope = (await response.json()) as Envelope;
    if (!response.ok) {
      const code = envelope.error?.code ?? `HTTP_${response.status}`;
      throw new Error(`Runtime control plane request failed: ${code}`);
    }
    return envelope.data;
  }

  async lease(credential: string, workerId: string): Promise<RuntimeLease> {
    return leaseResponseSchema.parse(
      await this.#request(credential, "POST", "/api/v1/internal/agent-runtime/lease", {
        workerId,
        leaseSeconds: 60,
      }),
    );
  }

  async context(credential: string, workerId: string, runId: string): Promise<RuntimeContext> {
    return contextResponseSchema.parse(
      await this.#request(
        credential,
        "GET",
        `/api/v1/internal/agent-runtime/runs/${runId}/context`,
        undefined,
        workerId,
      ),
    );
  }

  async heartbeat(
    credential: string,
    workerId: string,
    runId: string,
    runtimeStatus: string,
  ): Promise<{ cancelRequested: boolean }> {
    return z.object({ cancelRequested: z.boolean() }).parse(
      await this.#request(credential, "POST", "/api/v1/internal/agent-runtime/heartbeat", {
        runId,
        workerId,
        leaseSeconds: 60,
        runtimeStatus,
      }),
    );
  }

  async recordActions(
    credential: string,
    workerId: string,
    runId: string,
    actions: unknown[],
  ): Promise<void> {
    await this.#request(
      credential,
      "POST",
      `/api/v1/internal/agent-runtime/runs/${runId}/actions`,
      { workerId, actions },
    );
  }

  async executeActions(
    credential: string,
    workerId: string,
    runId: string,
    sequences: number[],
  ): Promise<RuntimeExecution> {
    return actionsResponseSchema.parse(
      await this.#request(
        credential,
        "POST",
        `/api/v1/internal/agent-runtime/runs/${runId}/actions/execute`,
        { workerId, sequences },
      ),
    );
  }

  async recordMemories(
    credential: string,
    workerId: string,
    runId: string,
    memories: unknown[],
  ): Promise<void> {
    await this.#request(
      credential,
      "POST",
      `/api/v1/internal/agent-runtime/runs/${runId}/memories`,
      { workerId, memories },
    );
  }

  async recordSourceResult(
    credential: string,
    workerId: string,
    runId: string,
    result: Record<string, unknown>,
  ): Promise<void> {
    await this.#request(
      credential,
      "POST",
      `/api/v1/internal/agent-runtime/runs/${runId}/sources`,
      { workerId, ...result },
    );
  }

  async complete(
    credential: string,
    workerId: string,
    runId: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    await this.#request(
      credential,
      "POST",
      `/api/v1/internal/agent-runtime/runs/${runId}/complete`,
      { workerId, ...input },
    );
  }

  async fail(
    credential: string,
    workerId: string,
    runId: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    await this.#request(credential, "POST", `/api/v1/internal/agent-runtime/runs/${runId}/fail`, {
      workerId,
      ...input,
    });
  }
}
