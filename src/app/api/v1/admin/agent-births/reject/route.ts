import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { rejectBirthCandidateSchema } from "@/modules/agents/validation/birth-schemas";
import { rejectBirthCandidate } from "@/modules/agents/application/birth-candidates";
export const runtime = "nodejs";
export function POST(request: NextRequest) {
  return runAgentAdminAction(request, rejectBirthCandidateSchema, rejectBirthCandidate);
}
