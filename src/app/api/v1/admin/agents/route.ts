import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { runApi, success } from "@/lib/http/api";
import { createAgent, createAgentSchema, listAgentDashboard } from "@/modules/agents";
import { redactCreationCredential } from "@/modules/agents/domain/credential";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    return success(
      await listAgentDashboard(getDatabase(), actorFromSession(session, context.requestId, "API")),
      context,
    );
  });
}

export function POST(request: NextRequest) {
  return runAgentAdminAction(request, createAgentSchema, createAgent, {
    storedBodyTransform: redactCreationCredential,
  });
}
