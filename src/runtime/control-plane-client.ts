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
    document: z.unknown().optional(),
    renderedPrompt: z.string(),
    behavior: z
      .object({
        topicCreationTendency: z.number().min(0).max(1),
        votingTendency: z.number().min(0).max(1),
        followingTendency: z.number().min(0).max(1),
      })
      .strict(),
    writing: z
      .object({
        entryLength: z.enum(["SHORT", "MEDIUM", "LONG", "MIXED"]),
      })
      .strict(),
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

const stochasticTickResponseSchema = z.object({
  tickKey: z.iso.datetime(),
  createdRuns: z.number().int().nonnegative(),
  selectedAgentProfileIds: z.array(z.string().uuid()),
  skipReason: z
    .enum([
      "RUNTIME_DISABLED",
      "SCHEDULER_DISABLED",
      "PUBLIC_WRITE_DISABLED",
      "MAINTENANCE_MODE",
      "CAPACITY_FULL",
      "QUEUE_NOT_EMPTY",
      "TICK_ALREADY_PROCESSED",
      "QUIET_WINDOW",
      "NO_ELIGIBLE_AGENT",
    ])
    .nullable(),
  workerId: z.string(),
});

const runtimeCredentialRosterResponseSchema = z.object({
  workerId: z.string(),
  desiredFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  activeCredentialIds: z.array(z.string().uuid()),
  entries: z.array(
    z.object({
      credentialId: z.string().uuid(),
      agentProfileId: z.string().uuid(),
      prefix: z.string().min(1).max(24),
      enrollmentCipher: z.string().min(1),
    }),
  ),
});

const runtimeCredentialIdentityResponseSchema = z.object({
  workerId: z.string(),
  credentialId: z.string().uuid(),
  agentProfileId: z.string().uuid(),
});

const runtimeCredentialRosterSyncResponseSchema = z.object({
  workerId: z.string(),
  desiredFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  loadedCredentialCount: z.number().int().nonnegative(),
  syncedAt: z.union([z.iso.datetime(), z.date()]),
  workerTelemetry: z
    .object({
      bootId: z.string().uuid(),
      processingLanes: z.number().int().min(1).max(2),
      codexVersion: z.string().nullable(),
      promptProfileHash: z.string().nullable(),
      startedAt: z.union([z.iso.datetime(), z.date()]).nullable(),
      restartCount: z.number().int().nonnegative(),
    })
    .nullable(),
});

export type RuntimeLease = z.infer<typeof leaseResponseSchema>;
export type RuntimeContext = z.infer<typeof contextResponseSchema>;
export type RuntimeExecution = z.infer<typeof actionsResponseSchema>;
export type RuntimeStochasticTickResult = z.infer<typeof stochasticTickResponseSchema>;
export type RuntimeCredentialRoster = z.infer<typeof runtimeCredentialRosterResponseSchema>;

export interface RuntimeWorkerTelemetry {
  bootId: string;
  processingLanes: number;
  codexVersion: string;
  promptProfileHash: string;
  startedAt: string;
}

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

export interface RuntimeCredentialRosterControlPlane {
  credentialRoster(credential: string, workerId: string): Promise<RuntimeCredentialRoster>;
  credentialIdentity(
    credential: string,
    workerId: string,
  ): Promise<z.infer<typeof runtimeCredentialIdentityResponseSchema>>;
  acknowledgeCredentialRoster(
    credential: string,
    workerId: string,
    desiredFingerprint: string,
    loadedCredentialIds: string[],
    workerTelemetry?: RuntimeWorkerTelemetry,
  ): Promise<void>;
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
    /** Ajanın okumak için seçtiği başlıklar; boşsa davranış değişmez. */
    readTopicIds?: readonly string[],
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

export interface RuntimeStochasticSchedulerControlPlane {
  tickScheduler(credential: string, workerId: string): Promise<RuntimeStochasticTickResult>;
}

interface Envelope {
  data?: unknown;
  error?: { code?: string; message?: string };
}

const CONTROL_PLANE_HOST = "127.0.0.1";
const CONTROL_PLANE_PORT = "3000";
const MAXIMUM_CONTROL_PLANE_RESPONSE_BYTES = 2 * 1024 * 1024;

export function canonicalRuntimeControlPlaneBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RuntimeControlPlaneError("CONTROL_PLANE_BASE_URL_INVALID");
  }
  const hostname = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1"].includes(hostname) ||
    url.port !== CONTROL_PLANE_PORT ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new RuntimeControlPlaneError("CONTROL_PLANE_BASE_URL_INVALID");
  return `http://${CONTROL_PLANE_HOST}:${CONTROL_PLANE_PORT}`;
}

function jsonContentType(response: Response): boolean {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

async function boundedJsonEnvelope(response: Response): Promise<Envelope> {
  if (response.redirected || (response.status >= 300 && response.status < 400))
    throw new RuntimeControlPlaneError("CONTROL_PLANE_REDIRECT_BLOCKED");
  if (!jsonContentType(response))
    throw new RuntimeControlPlaneError("CONTROL_PLANE_CONTENT_TYPE_INVALID");

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_CONTROL_PLANE_RESPONSE_BYTES)
    throw new RuntimeControlPlaneError("CONTROL_PLANE_RESPONSE_TOO_LARGE");

  const reader = response.body?.getReader();
  if (!reader) throw new RuntimeControlPlaneError("CONTROL_PLANE_RESPONSE_INVALID");
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAXIMUM_CONTROL_PLANE_RESPONSE_BYTES) {
      await reader.cancel();
      throw new RuntimeControlPlaneError("CONTROL_PLANE_RESPONSE_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as Envelope;
  } catch {
    throw new RuntimeControlPlaneError("CONTROL_PLANE_RESPONSE_INVALID");
  }
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
    this.#baseUrl = canonicalRuntimeControlPlaneBaseUrl(baseUrl);
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
      accept: "application/json",
    };
    const request = () => {
      const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
      return this.#fetch(url, {
        method,
        headers,
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
        redirect: "manual",
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
    const envelope = await boundedJsonEnvelope(response);
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

  async tickScheduler(credential: string, workerId: string): Promise<RuntimeStochasticTickResult> {
    const idempotencyKey = randomUUID();
    return stochasticTickResponseSchema.parse(
      await this.#request(
        credential,
        "POST",
        "/api/v1/internal/agent-runtime/scheduler/tick",
        { workerId },
        undefined,
        undefined,
        { idempotencyKey, retryTransportFailureOnce: true },
      ),
    );
  }

  async credentialRoster(credential: string, workerId: string): Promise<RuntimeCredentialRoster> {
    return runtimeCredentialRosterResponseSchema.parse(
      await this.#request(
        credential,
        "GET",
        "/api/v1/internal/agent-runtime/credentials/roster",
        undefined,
        workerId,
      ),
    );
  }

  async credentialIdentity(
    credential: string,
    workerId: string,
  ): Promise<z.infer<typeof runtimeCredentialIdentityResponseSchema>> {
    return runtimeCredentialIdentityResponseSchema.parse(
      await this.#request(
        credential,
        "GET",
        "/api/v1/internal/agent-runtime/credentials/identity",
        undefined,
        workerId,
      ),
    );
  }

  async acknowledgeCredentialRoster(
    credential: string,
    workerId: string,
    desiredFingerprint: string,
    loadedCredentialIds: string[],
    workerTelemetry?: RuntimeWorkerTelemetry,
  ): Promise<void> {
    const idempotencyKey = randomUUID();
    runtimeCredentialRosterSyncResponseSchema.parse(
      await this.#request(
        credential,
        "POST",
        "/api/v1/internal/agent-runtime/credentials/sync",
        {
          workerId,
          desiredFingerprint,
          loadedCredentialIds,
          ...(workerTelemetry ? { workerTelemetry } : {}),
        },
        undefined,
        undefined,
        { idempotencyKey, retryTransportFailureOnce: true },
      ),
    );
  }

  async context(
    credential: string,
    workerId: string,
    runId: string,
    leaseToken: string,
    options?: RuntimeRequestOptions,
    readTopicIds: readonly string[] = [],
  ): Promise<RuntimeContext> {
    const query =
      readTopicIds.length > 0 ? `?readTopicIds=${encodeURIComponent(readTopicIds.join(","))}` : "";
    return contextResponseSchema.parse(
      await this.#request(
        credential,
        "GET",
        `/api/v1/internal/agent-runtime/runs/${runId}/context${query}`,
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
