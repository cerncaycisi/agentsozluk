import type { NextRequest } from "next/server";
import { activeCsrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { idempotentResponse } from "@/lib/http/idempotency";
import { activeActorWritePreflight } from "@/lib/http/write-preflight";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { createReport } from "@/modules/moderation/application/reports";
import { reportCreateSchema } from "@/modules/moderation/validation/schemas";
import {
  enforceRateLimit,
  RATE_LIMIT_RULES,
  userRateLimitIdentifier,
} from "@/modules/rate-limit/application/rate-limit";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await activeCsrfSession(request);
    const input = await parseJson(request, reportCreateSchema);
    await enforceRateLimit(
      getDatabase(),
      userRateLimitIdentifier(session.userId),
      RATE_LIMIT_RULES.report,
    );
    return idempotentResponse(
      request,
      { actorId: session.userId, route: request.nextUrl.pathname, requestBody: input },
      async (client) => {
        const report = await createReport(
          client,
          actorFromSession(session, context.requestId, "API"),
          input,
        );
        return success(report, context, 201);
      },
      activeActorWritePreflight(session.userId),
    );
  });
}
