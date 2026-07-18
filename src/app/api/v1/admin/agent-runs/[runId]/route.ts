import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { parseUuid } from "@/lib/http/request";
import { getAgentRunDetail } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const runId = parseUuid((await params).runId, "runId");
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    return success(
      await getAgentRunDetail(
        getDatabase(),
        actorFromSession(session, context.requestId, "API"),
        runId,
      ),
      context,
    );
  });
}
