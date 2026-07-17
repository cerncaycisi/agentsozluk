import type { NextRequest } from "next/server";
import type { ZodType } from "zod";
import { activeCsrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import type { DatabaseExecutor } from "@/lib/db/types";
import { parseJson, runApi, success } from "@/lib/http/api";
import { idempotentResponse } from "@/lib/http/idempotency";
import { actorFromSession, type ActorContext } from "@/modules/auth/domain/actor";
import {
  authorizeModerationCommand,
  type ModerationAuthorizationOptions,
} from "@/modules/moderation/application/authorization";
import {
  enforceRateLimit,
  RATE_LIMIT_RULES,
  userRateLimitIdentifier,
} from "@/modules/rate-limit/application/rate-limit";

type ModerationAuthorization<T> =
  | ModerationAuthorizationOptions
  | ((input: T) => ModerationAuthorizationOptions);

export function runModerationAction<T>(
  request: NextRequest,
  schema: ZodType<T>,
  action: (client: DatabaseExecutor, actor: ActorContext, input: T) => Promise<unknown>,
  authorization: ModerationAuthorization<T> = {},
) {
  return runApi(request, async (context) => {
    const session = await activeCsrfSession(request);
    const input = await parseJson(request, schema);
    const actor = actorFromSession(session, context.requestId, "API");
    const authorizationOptions =
      typeof authorization === "function" ? authorization(input) : authorization;
    await enforceRateLimit(
      getDatabase(),
      userRateLimitIdentifier(session.userId),
      RATE_LIMIT_RULES.moderationCommand,
    );
    return idempotentResponse(
      request,
      { actorId: session.userId, route: request.nextUrl.pathname, requestBody: input },
      async (client) => success(await action(client, actor, input), context),
      async (client) => authorizeModerationCommand(client, actor, authorizationOptions),
    );
  });
}
