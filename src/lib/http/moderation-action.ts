import type { NextRequest } from "next/server";
import type { ZodType } from "zod";
import { activeCsrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { idempotentResponse } from "@/lib/http/idempotency";
import { actorFromSession, type ActorContext } from "@/modules/auth/domain/actor";

export function runModerationAction<T>(
  request: NextRequest,
  schema: ZodType<T>,
  action: (actor: ActorContext, input: T) => Promise<unknown>,
) {
  return runApi(request, async (context) => {
    const session = await activeCsrfSession(request);
    const input = await parseJson(request, schema);
    return idempotentResponse(
      request,
      { actorId: session.userId, route: request.nextUrl.pathname, requestBody: input },
      async () =>
        success(await action(actorFromSession(session, context.requestId, "API"), input), context),
    );
  });
}

export { getDatabase };
