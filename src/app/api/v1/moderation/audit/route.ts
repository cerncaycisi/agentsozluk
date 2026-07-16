import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, successList } from "@/lib/http/api";
import { paginationFrom } from "@/lib/http/pagination";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getAuditLogs } from "@/modules/moderation/application/queries";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    const url = new URL(request.url);
    const pagination = paginationFrom(url);
    const value = (key: string) => url.searchParams.get(key) || undefined;
    const actorId = value("actorId");
    const action = value("action");
    const entityType = value("entityType");
    const requestId = value("requestId");
    const from = value("from");
    const to = value("to");
    const [logs, totalItems] = await getAuditLogs(
      getDatabase(),
      actorFromSession(session, context.requestId, "API"),
      {
        ...(actorId ? { actorId } : {}),
        ...(action ? { action } : {}),
        ...(entityType ? { entityType } : {}),
        ...(requestId ? { requestId } : {}),
        ...(from ? { createdFrom: new Date(from) } : {}),
        ...(to ? { createdTo: new Date(to) } : {}),
        skip: pagination.skip,
        take: pagination.pageSize,
      },
    );
    return successList(logs, context, { ...pagination, totalItems });
  });
}
