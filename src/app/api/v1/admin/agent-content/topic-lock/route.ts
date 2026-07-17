import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { agentTopicWriteLockSchema, setAgentTopicWriteLock } from "@/modules/moderation";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runAgentAdminAction(request, agentTopicWriteLockSchema, setAgentTopicWriteLock);
}
