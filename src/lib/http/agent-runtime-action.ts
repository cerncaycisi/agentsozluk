import type { NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import { SESSION_COOKIE_NAME } from "@/config/app";
import { getDatabase } from "@/lib/db/client";
import type { DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { parseJson, runApi, success } from "@/lib/http/api";
import { idempotentResponse } from "@/lib/http/idempotency";
import { sha256 } from "@/lib/security/crypto";
import type { JsonValue } from "@/modules/idempotency/domain/idempotency";
import { recoverRuntimeLeaseTokenForIdempotencyReplay } from "@/modules/agents/application/runtime";
import {
  authenticateRuntimeRequest,
  type RuntimePrincipal,
} from "@/modules/agents/application/runtime-auth";
import type { RuntimeScope } from "@/modules/agents/domain/runtime-auth";
import {
  runtimeLeaseTokenSchema,
  runtimeWorkerIdSchema,
} from "@/modules/agents/validation/runtime-schemas";
import {
  enforceRateLimit,
  RATE_LIMIT_RULES,
  runtimeCredentialRateLimitIdentifier,
} from "@/modules/rate-limit/application/rate-limit";

function authenticationInput(request: NextRequest, requestId: string, requiredScope: RuntimeScope) {
  return {
    authorization: request.headers.get("authorization"),
    hasBrowserSession: request.cookies.has(SESSION_COOKIE_NAME),
    requiredScope,
    requestId,
  };
}

async function rateLimitRuntime(principal: RuntimePrincipal): Promise<void> {
  await enforceRateLimit(
    getDatabase(),
    runtimeCredentialRateLimitIdentifier(principal.credentialId),
    RATE_LIMIT_RULES.agentRuntimeInternal,
  );
}

const LEASE_TOKEN_FINGERPRINT_FIELD = "leaseTokenFingerprint";
const uuidSchema = z.string().uuid();

function jsonRecord(value: JsonValue | undefined): Record<string, JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function invalidLeaseReplay(): AppError {
  return new AppError(
    "AGENT_RUN_LEASE_INVALID",
    409,
    "Idempotent lease replay yalnız aynı aktif lease generation için kullanılabilir.",
  );
}

export function storeRuntimeLeaseIdempotencyTombstone(body: JsonValue): JsonValue {
  const root = jsonRecord(body);
  const data = jsonRecord(root?.data);
  if (!root || !data || !("run" in data))
    throw new AppError("INTERNAL_ERROR", 500, "Lease response güvenli biçimde saklanamadı.");
  if (data.run === null) return body;

  const run = jsonRecord(data.run);
  const token = runtimeLeaseTokenSchema.safeParse(run?.leaseToken);
  const runId = uuidSchema.safeParse(run?.id);
  if (!run || !token.success || !runId.success)
    throw new AppError("INTERNAL_ERROR", 500, "Lease response güvenli biçimde saklanamadı.");

  const storedRun: Record<string, JsonValue> = {
    ...run,
    [LEASE_TOKEN_FINGERPRINT_FIELD]: sha256(token.data),
  };
  delete storedRun.leaseToken;
  return { ...root, data: { ...data, run: storedRun } };
}

export async function replayRuntimeLeaseIdempotencyTombstone(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  input: { workerId: string },
  body: JsonValue,
): Promise<JsonValue> {
  const root = jsonRecord(body);
  const data = jsonRecord(root?.data);
  if (!root || !data || !("run" in data)) throw invalidLeaseReplay();
  if (data.run === null) return body;

  const run = jsonRecord(data.run);
  const runId = uuidSchema.safeParse(run?.id);
  const fingerprint = run?.[LEASE_TOKEN_FINGERPRINT_FIELD];
  if (
    !run ||
    !runId.success ||
    typeof fingerprint !== "string" ||
    !/^[a-f0-9]{64}$/u.test(fingerprint)
  )
    throw invalidLeaseReplay();

  const leaseToken = await recoverRuntimeLeaseTokenForIdempotencyReplay(client, principal, {
    runId: runId.data,
    workerId: input.workerId,
    leaseTokenFingerprint: fingerprint,
  });
  const replayedRun: Record<string, JsonValue> = { ...run, leaseToken };
  delete replayedRun[LEASE_TOKEN_FINGERPRINT_FIELD];
  return { ...root, data: { ...data, run: replayedRun } };
}

interface RuntimeActionIdempotencyOptions<T> {
  storedBodyTransform?: (body: JsonValue) => JsonValue;
  replayedBodyTransform?: (
    client: DatabaseExecutor,
    principal: RuntimePrincipal,
    input: T,
    body: JsonValue,
  ) => JsonValue | Promise<JsonValue>;
}

export function runAgentRuntimeAction<T>(
  request: NextRequest,
  schema: ZodType<T>,
  requiredScope: RuntimeScope,
  action: (client: DatabaseExecutor, principal: RuntimePrincipal, input: T) => Promise<unknown>,
  options: RuntimeActionIdempotencyOptions<T> = {},
) {
  return runApi(request, async (context) => {
    const replayedBodyTransform = options.replayedBodyTransform;
    const authInput = authenticationInput(request, context.requestId, requiredScope);
    const principal = await authenticateRuntimeRequest(getDatabase(), authInput);
    await rateLimitRuntime(principal);
    const input = await parseJson(request, schema);
    if (!request.headers.get("idempotency-key")) {
      throw new AppError(
        "VALIDATION_ERROR",
        422,
        "Internal runtime yazma isteklerinde Idempotency-Key zorunludur.",
      );
    }
    return idempotentResponse(
      request,
      { actorId: principal.actor.actorId, route: request.nextUrl.pathname, requestBody: input },
      async (client) => success(await action(client, principal, input), context),
      async (client) => {
        await authenticateRuntimeRequest(client, authInput);
      },
      options.storedBodyTransform,
      replayedBodyTransform
        ? (body, client) => replayedBodyTransform(client, principal, input, body)
        : undefined,
    );
  });
}

export function runAgentRuntimeRead(
  request: NextRequest,
  requiredScope: RuntimeScope,
  action: (
    client: DatabaseExecutor,
    principal: RuntimePrincipal,
    workerId: string,
    leaseToken: string,
  ) => Promise<unknown>,
) {
  return runApi(request, async (context) => {
    const principal = await authenticateRuntimeRequest(
      getDatabase(),
      authenticationInput(request, context.requestId, requiredScope),
    );
    await rateLimitRuntime(principal);
    const workerId = runtimeWorkerIdSchema.parse(request.headers.get("x-agent-worker-id"));
    const leaseToken = runtimeLeaseTokenSchema.parse(request.headers.get("x-agent-lease-token"));
    return success(await action(getDatabase(), principal, workerId, leaseToken), context);
  });
}
