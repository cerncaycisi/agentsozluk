import type { NextRequest } from "next/server";
import { runAgentRuntimeAction } from "@/lib/http/agent-runtime-action";
import { birthTickSchema } from "@/modules/agents/validation/birth-schemas";
import { runRuntimeBirthTick } from "@/modules/agents/application/birth-candidates";
export const runtime = "nodejs";
export function POST(request: NextRequest) {
  return runAgentRuntimeAction(request, birthTickSchema, "runtime:plan", runRuntimeBirthTick);
}
