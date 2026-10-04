import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { prepareBirthCandidateSchema } from "@/modules/agents/validation/birth-schemas";
import { prepareBirthCandidate } from "@/modules/agents/application/birth-preparation";
export const runtime = "nodejs";
export function POST(request: NextRequest) {
  return runAgentAdminAction(request, prepareBirthCandidateSchema, prepareBirthCandidate);
}
