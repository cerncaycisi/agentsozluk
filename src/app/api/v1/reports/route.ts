import type { NextRequest } from "next/server";
import { activeCsrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { idempotentResponse } from "@/lib/http/idempotency";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { createReport } from "@/modules/moderation/application/reports";
import { reportCreateSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await activeCsrfSession(request);
    const input = await parseJson(request, reportCreateSchema);
    return idempotentResponse(
      request,
      { actorId: session.userId, route: request.nextUrl.pathname, requestBody: input },
      async () => {
        const report = await createReport(
          getDatabase(),
          actorFromSession(session, context.requestId, "API"),
          input,
        );
        return success(report, context, 201);
      },
    );
  });
}
