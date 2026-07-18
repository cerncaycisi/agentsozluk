import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, successList } from "@/lib/http/api";
import { paginationFrom } from "@/lib/http/pagination";
import { parseUuid } from "@/lib/http/request";
import { listAgentMemories } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const agentId = parseUuid((await params).agentId, "agentId");
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    const pagination = paginationFrom(new URL(request.url));
    const [memories, totalItems] = await listAgentMemories(
      getDatabase(),
      actorFromSession(session, context.requestId, "API"),
      agentId,
      { skip: pagination.skip, take: pagination.pageSize },
    );
    return successList(memories, context, { ...pagination, totalItems });
  });
}
