import type { NextRequest } from "next/server";
import { runAgentRuntimeWorkerRead } from "@/lib/http/agent-runtime-action";
import { getRuntimeCredentialRoster } from "@/modules/agents";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runAgentRuntimeWorkerRead(request, "runtime:plan", getRuntimeCredentialRoster);
}
