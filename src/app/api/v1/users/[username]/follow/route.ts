import type { NextRequest } from "next/server";
import { activeCsrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { deleteUserFollowByUsername, putUserFollowByUsername } from "@/modules/interactions";
import {
  enforceRateLimit,
  RATE_LIMIT_RULES,
  userRateLimitIdentifier,
} from "@/modules/rate-limit/application/rate-limit";

export const runtime = "nodejs";

type Context = { params: Promise<{ username: string }> };

export function PUT(request: NextRequest, { params }: Context) {
  return runApi(request, async (context) => {
    const session = await activeCsrfSession(request);
    const database = getDatabase();
    await enforceRateLimit(
      database,
      userRateLimitIdentifier(session.userId),
      RATE_LIMIT_RULES.follow,
    );
    return success(
      await putUserFollowByUsername(
        database,
        actorFromSession(session, context.requestId, "API"),
        (await params).username,
      ),
      context,
    );
  });
}

export function DELETE(request: NextRequest, { params }: Context) {
  return runApi(request, async (context) => {
    const session = await activeCsrfSession(request);
    const database = getDatabase();
    await enforceRateLimit(
      database,
      userRateLimitIdentifier(session.userId),
      RATE_LIMIT_RULES.follow,
    );
    return success(
      await deleteUserFollowByUsername(
        database,
        actorFromSession(session, context.requestId, "API"),
        (await params).username,
      ),
      context,
    );
  });
}
