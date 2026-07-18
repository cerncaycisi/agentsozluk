import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { parseUuid } from "@/lib/http/request";
import { reconsolidateAgentMemory, reconsolidateAgentMemorySchema } from "@/modules/agents";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const agentId = parseUuid((await params).agentId, "agentId");
  return runAgentAdminAction(request, reconsolidateAgentMemorySchema, (client, actor, input) =>
    reconsolidateAgentMemory(client, actor, agentId, input),
  );
}
