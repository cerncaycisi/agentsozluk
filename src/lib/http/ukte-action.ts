import type { NextRequest } from "next/server";
import type { ZodType } from "zod";
import { activeCsrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import type { DatabaseExecutor } from "@/lib/db/types";
import { parseJson, runApi, success } from "@/lib/http/api";
import { idempotentResponse } from "@/lib/http/idempotency";
import { actorFromSession, type ActorContext } from "@/modules/auth/domain/actor";
import { authorizeUkteAction } from "@/modules/uktes/application/uktes";
import {
  enforceRateLimit,
  RATE_LIMIT_RULES,
  userRateLimitIdentifier,
} from "@/modules/rate-limit/application/rate-limit";

export function runUkteAction<T>(
  request: NextRequest,
  schema: ZodType<T>,
  access: "WRITE" | "WITHDRAW" | "ADMIN",
  action: (db: DatabaseExecutor, actor: ActorContext, input: T) => Promise<unknown>,
) {
  return runApi(request, async (context) => {
    const session = await activeCsrfSession(request);
    const actor = actorFromSession(session, context.requestId, "API");
    const input = await parseJson(request, schema);
    await enforceRateLimit(
      getDatabase(),
      userRateLimitIdentifier(session.userId),
      access === "WRITE"
        ? RATE_LIMIT_RULES.ukteCreate
        : access === "ADMIN"
          ? RATE_LIMIT_RULES.moderationCommand
          : RATE_LIMIT_RULES.ukteWithdraw,
    );
    return idempotentResponse(
      request,
      { actorId: session.userId, route: request.nextUrl.pathname, requestBody: input },
      async (db) => success(await action(db, actor, input), context),
      async (db) => {
        await authorizeUkteAction(db, actor, access);
      },
    );
  });
}
