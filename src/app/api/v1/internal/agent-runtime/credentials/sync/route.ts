import type { NextRequest } from "next/server";
import { runAgentRuntimeAction } from "@/lib/http/agent-runtime-action";
import {
  acknowledgeRuntimeCredentialRoster,
  runtimeCredentialRosterAckSchema,
} from "@/modules/agents";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runAgentRuntimeAction(
    request,
    runtimeCredentialRosterAckSchema,
    "runtime:plan",
    acknowledgeRuntimeCredentialRoster,
  );
}
