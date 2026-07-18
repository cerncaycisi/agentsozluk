import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { recordRuntimeCapability, runtimeConcurrencyCapabilitySchema } from "@/modules/agents";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runAgentAdminAction(request, runtimeConcurrencyCapabilitySchema, (client, actor, input) =>
    recordRuntimeCapability(client, actor, input),
  );
}
