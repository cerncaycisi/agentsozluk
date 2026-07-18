import type { NextRequest } from "next/server";
import { runAgentRuntimeAction } from "@/lib/http/agent-runtime-action";
import { parseUuid } from "@/lib/http/request";
import { recordRuntimeSourceAttempt, runtimeSourceAttemptSchema } from "@/modules/agents";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const runId = parseUuid((await params).runId, "runId");
  return runAgentRuntimeAction(
    request,
    runtimeSourceAttemptSchema,
    "runtime:write",
    (client, principal, input) => recordRuntimeSourceAttempt(client, principal, runId, input),
  );
}
