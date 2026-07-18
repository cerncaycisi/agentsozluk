import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { agentContentBulkActionSchema, bulkSetAgentContentVisibility } from "@/modules/moderation";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runAgentAdminAction(request, agentContentBulkActionSchema, (client, actor, input) =>
    bulkSetAgentContentVisibility(client, actor, true, input),
  );
}
