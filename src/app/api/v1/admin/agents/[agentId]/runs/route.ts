import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { runApi, success } from "@/lib/http/api";
import { parseUuid } from "@/lib/http/request";
import { createManualAgentRun, listAgentRuns, manualAgentRunSchema } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const agentId = parseUuid((await params).agentId, "agentId");
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    return success(
      await listAgentRuns(
        getDatabase(),
        actorFromSession(session, context.requestId, "API"),
        agentId,
      ),
      context,
    );
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const agentId = parseUuid((await params).agentId, "agentId");
  return runAgentAdminAction(request, manualAgentRunSchema, (client, actor, input) =>
    createManualAgentRun(client, actor, agentId, input),
  );
}
