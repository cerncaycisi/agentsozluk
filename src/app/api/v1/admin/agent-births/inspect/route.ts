import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { inspectBirthCandidateSchema } from "@/modules/agents/validation/birth-schemas";
import { inspectBirthCandidate } from "@/modules/agents/application/birth-candidates";
export const runtime = "nodejs";
export function POST(request: NextRequest) {
  return runAgentAdminAction(request, inspectBirthCandidateSchema, inspectBirthCandidate, {
    refreshOnReplay: true,
  });
}
