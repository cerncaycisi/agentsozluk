import type { NextRequest } from "next/server";
import { activeCsrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { decideReport } from "@/modules/moderation/application/reports";
import { reportDecisionSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export function POST(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  return runApi(request, async (context) => {
    const session = await activeCsrfSession(request);
    const { reportId } = await params;
    return success(
      await decideReport(
        getDatabase(),
        actorFromSession(session, context.requestId, "API"),
        reportId,
        "REJECTED",
        await parseJson(request, reportDecisionSchema),
      ),
      context,
    );
  });
}
