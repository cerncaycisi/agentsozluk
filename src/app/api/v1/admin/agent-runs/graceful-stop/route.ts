import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import {
  gracefullyStopAllActiveAgentRuns,
  gracefulStopGlobalAgentRunsSchema,
} from "@/modules/agents";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runAgentAdminAction(
    request,
    gracefulStopGlobalAgentRunsSchema,
    gracefullyStopAllActiveAgentRuns,
  );
}
