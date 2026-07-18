import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, successList } from "@/lib/http/api";
import { paginationFrom } from "@/lib/http/pagination";
import { parseUuid } from "@/lib/http/request";
import {
  agentSourceStatuses,
  type AgentSourceStatusValue,
  listAgentSources,
} from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const runtime = "nodejs";

const statuses = new Set<AgentSourceStatusValue>(agentSourceStatuses);

function booleanFilter(value: string | null): boolean | undefined {
  return value === "true" ? true : value === "false" ? false : undefined;
}

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    const url = new URL(request.url);
    const pagination = paginationFrom(url);
    const status = url.searchParams.get("status") as AgentSourceStatusValue | null;
    const adminPinned = booleanFilter(url.searchParams.get("adminPinned"));
    const adminBlocked = booleanFilter(url.searchParams.get("adminBlocked"));
    const [sources, totalItems] = await listAgentSources(
      getDatabase(),
      actorFromSession(session, context.requestId, "API"),
      {
        ...(url.searchParams.get("agentProfileId")
          ? {
              agentProfileId: parseUuid(url.searchParams.get("agentProfileId")!, "agentProfileId"),
            }
          : {}),
        ...(status && statuses.has(status) ? { status } : {}),
        ...(adminPinned !== undefined ? { adminPinned } : {}),
        ...(adminBlocked !== undefined ? { adminBlocked } : {}),
        ...(url.searchParams.get("domain") ? { domain: url.searchParams.get("domain")! } : {}),
        skip: pagination.skip,
        take: pagination.pageSize,
      },
    );
    return successList(sources, context, { ...pagination, totalItems });
  });
}
