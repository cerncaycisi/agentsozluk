import type { NextRequest } from "next/server";
import type { ZodType } from "zod";
import { activeCsrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import type { DatabaseExecutor } from "@/lib/db/types";
import { parseJson, runApi, success } from "@/lib/http/api";
import { idempotentResponse } from "@/lib/http/idempotency";
import type { JsonValue } from "@/modules/idempotency/domain/idempotency";
import { authorizeAgentAdmin } from "@/modules/agents/application/authorization";
import { actorFromSession, type ActorContext } from "@/modules/auth/domain/actor";
import {
  enforceRateLimit,
  RATE_LIMIT_RULES,
  userRateLimitIdentifier,
} from "@/modules/rate-limit/application/rate-limit";

export function runAgentAdminAction<T>(
  request: NextRequest,
  schema: ZodType<T>,
  action: (client: DatabaseExecutor, actor: ActorContext, input: T) => Promise<unknown>,
  options: { storedBodyTransform?: (body: JsonValue) => JsonValue } = {},
) {
  return runApi(request, async (context) => {
    const session = await activeCsrfSession(request);
    const input = await parseJson(request, schema);
    const actor = actorFromSession(session, context.requestId, "API");
    await enforceRateLimit(
      getDatabase(),
      userRateLimitIdentifier(session.userId),
      RATE_LIMIT_RULES.moderationCommand,
    );
    return idempotentResponse(
      request,
      { actorId: session.userId, route: request.nextUrl.pathname, requestBody: input },
      async (client) => success(await action(client, actor, input), context),
      async (client) => authorizeAgentAdmin(client, actor),
      options.storedBodyTransform,
    );
  });
}
