import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { parseUuid } from "@/lib/http/request";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getModerationReport } from "@/modules/moderation/application/reports";

export const runtime = "nodejs";

export function GET(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    const { reportId: rawReportId } = await params;
    const reportId = parseUuid(rawReportId, "reportId");
    return success(
      await getModerationReport(
        getDatabase(),
        actorFromSession(session, context.requestId, "API"),
        reportId,
      ),
      context,
    );
  });
}
