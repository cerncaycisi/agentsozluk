import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { birthModeSchema } from "@/modules/agents/validation/birth-schemas";
import { changeBirthMode } from "@/modules/agents/application/birth-candidates";
export const runtime = "nodejs";
export function POST(request: NextRequest) {
  return runAgentAdminAction(request, birthModeSchema, changeBirthMode);
}
