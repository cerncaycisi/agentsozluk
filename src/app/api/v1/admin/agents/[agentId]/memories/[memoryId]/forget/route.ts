import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { parseUuid } from "@/lib/http/request";
import { forgetAgentMemory, forgetAgentMemorySchema } from "@/modules/agents";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; memoryId: string }> },
) {
  const resolved = await params;
  const agentId = parseUuid(resolved.agentId, "agentId");
  const memoryId = parseUuid(resolved.memoryId, "memoryId");
  return runAgentAdminAction(request, forgetAgentMemorySchema, (client, actor, input) =>
    forgetAgentMemory(client, actor, agentId, memoryId, input),
  );
}
