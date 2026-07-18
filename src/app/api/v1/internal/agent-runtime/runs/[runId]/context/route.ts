import type { NextRequest } from "next/server";
import { runAgentRuntimeRead } from "@/lib/http/agent-runtime-action";
import { parseUuid } from "@/lib/http/request";
import { getRuntimeRunContext } from "@/modules/agents";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const runId = parseUuid((await params).runId, "runId");
  return runAgentRuntimeRead(request, "runtime:read", (client, principal, workerId, leaseToken) =>
    getRuntimeRunContext(client, principal, runId, workerId, leaseToken),
  );
}
