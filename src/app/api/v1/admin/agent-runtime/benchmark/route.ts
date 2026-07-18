import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { recordRuntimeCapability, runtimeCapacityBenchmarkSchema } from "@/modules/agents";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runAgentAdminAction(request, runtimeCapacityBenchmarkSchema, (client, actor, input) =>
    recordRuntimeCapability(client, actor, input),
  );
}
