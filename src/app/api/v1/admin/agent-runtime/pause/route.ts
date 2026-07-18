import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { runtimeControlSchema, setGlobalRuntimeEnabled } from "@/modules/agents";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runAgentAdminAction(request, runtimeControlSchema, (client, actor, input) =>
    setGlobalRuntimeEnabled(client, actor, false, input),
  );
}
