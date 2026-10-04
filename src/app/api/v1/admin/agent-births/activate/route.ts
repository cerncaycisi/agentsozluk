import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { activateBirthCandidateSchema } from "@/modules/agents/validation/birth-schemas";
import { activateBirthCandidate } from "@/modules/agents/application/birth-activation";
export const runtime = "nodejs";
export function POST(request: NextRequest) {
  return runAgentAdminAction(request, activateBirthCandidateSchema, activateBirthCandidate);
}
