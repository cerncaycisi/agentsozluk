import type { ReportReason, ReportStatus, ReportTargetType } from "@prisma/client";
import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, successList } from "@/lib/http/api";
import { paginationFrom } from "@/lib/http/pagination";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getModerationReports } from "@/modules/moderation/application/reports";

export const runtime = "nodejs";

const statuses = new Set<ReportStatus>(["OPEN", "RESOLVED", "REJECTED"]);
const targetTypes = new Set<ReportTargetType>(["TOPIC", "ENTRY", "USER"]);
const reasons = new Set<ReportReason>([
  "SPAM",
  "HARASSMENT",
  "HATE",
  "ILLEGAL_CONTENT",
  "PERSONAL_DATA",
  "COPYRIGHT",
  "OFF_TOPIC",
  "OTHER",
]);

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    const url = new URL(request.url);
    const pagination = paginationFrom(url);
    const rawStatus = url.searchParams.get("status") as ReportStatus | null;
    const rawTargetType = url.searchParams.get("targetType") as ReportTargetType | null;
    const rawReason = url.searchParams.get("reason") as ReportReason | null;
    const [reports, totalItems] = await getModerationReports(
      getDatabase(),
      actorFromSession(session, context.requestId, "API"),
      {
        ...(rawStatus && statuses.has(rawStatus) ? { status: rawStatus } : {}),
        ...(rawTargetType && targetTypes.has(rawTargetType) ? { targetType: rawTargetType } : {}),
        ...(rawReason && reasons.has(rawReason) ? { reason: rawReason } : {}),
        ...(url.searchParams.get("reporter")
          ? { reporterUsername: url.searchParams.get("reporter")!.toLocaleLowerCase("tr-TR") }
          : {}),
        ...(url.searchParams.get("from")
          ? { createdFrom: new Date(url.searchParams.get("from")!) }
          : {}),
        ...(url.searchParams.get("to") ? { createdTo: new Date(url.searchParams.get("to")!) } : {}),
        skip: pagination.skip,
        take: pagination.pageSize,
      },
    );
    return successList(reports, context, { ...pagination, totalItems });
  });
}
