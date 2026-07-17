import type { NextRequest } from "next/server";
import type { ZodType } from "zod";
import { SESSION_COOKIE_NAME } from "@/config/app";
import { getDatabase } from "@/lib/db/client";
import type { DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { parseJson, runApi, success } from "@/lib/http/api";
import { idempotentResponse } from "@/lib/http/idempotency";
import {
  authenticateRuntimeRequest,
  type RuntimePrincipal,
} from "@/modules/agents/application/runtime-auth";
import type { RuntimeScope } from "@/modules/agents/domain/runtime-auth";
import { runtimeWorkerIdSchema } from "@/modules/agents/validation/runtime-schemas";
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

export function runAgentRuntimeAction<T>(
  request: NextRequest,
  schema: ZodType<T>,
  requiredScope: RuntimeScope,
  action: (client: DatabaseExecutor, principal: RuntimePrincipal, input: T) => Promise<unknown>,
) {
  return runApi(request, async (context) => {
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
  ) => Promise<unknown>,
) {
  return runApi(request, async (context) => {
    const principal = await authenticateRuntimeRequest(
      getDatabase(),
      authenticationInput(request, context.requestId, requiredScope),
    );
    await rateLimitRuntime(principal);
    const workerId = runtimeWorkerIdSchema.parse(request.headers.get("x-agent-worker-id"));
    return success(await action(getDatabase(), principal, workerId), context);
  });
}
