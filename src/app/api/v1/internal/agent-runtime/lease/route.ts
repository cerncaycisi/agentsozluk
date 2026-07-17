import type { NextRequest } from "next/server";
import { runAgentRuntimeAction } from "@/lib/http/agent-runtime-action";
import { leaseRuntimeRun, runtimeLeaseSchema } from "@/modules/agents";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runAgentRuntimeAction(request, runtimeLeaseSchema, "runtime:lease", leaseRuntimeRun);
}
