import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { parseUuid } from "@/lib/http/request";
import { agentSourceAdminUpdateSchema, updateAgentSourceAdmin } from "@/modules/agents";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const sourceId = parseUuid((await params).sourceId, "sourceId");
  return runAgentAdminAction(request, agentSourceAdminUpdateSchema, (client, actor, input) =>
    updateAgentSourceAdmin(client, actor, sourceId, input),
  );
}
