import type { NextRequest } from "next/server";
import { runAgentRuntimeAction } from "@/lib/http/agent-runtime-action";
import { heartbeatRuntimeRun, runtimeHeartbeatSchema } from "@/modules/agents";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runAgentRuntimeAction(
    request,
    runtimeHeartbeatSchema,
    "runtime:write",
    (client, principal, input) => heartbeatRuntimeRun(client, principal, input.runId, input),
  );
}
