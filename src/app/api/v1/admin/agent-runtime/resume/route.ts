import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { runtimeControlSchema, setSocietyFlowEnabled } from "@/modules/agents";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runAgentAdminAction(request, runtimeControlSchema, (client, actor, input) =>
    setSocietyFlowEnabled(client, actor, true, input),
  );
}
