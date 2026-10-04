import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { reverseRewardAssessmentSchema } from "@/modules/agents/validation/reward-schemas";
import { reverseAuthorAssessment } from "@/modules/agents/application/rewards";
export function POST(request: NextRequest) {
  return runAgentAdminAction(request, reverseRewardAssessmentSchema, reverseAuthorAssessment);
}
