import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { recordRuntimeCapabilityPackage, runtimeCapabilityPackageSchema } from "@/modules/agents";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runAgentAdminAction(request, runtimeCapabilityPackageSchema, (client, actor, input) =>
    recordRuntimeCapabilityPackage(client, actor, input),
  );
}
