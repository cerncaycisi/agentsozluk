import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { submitRewardAssessmentSchema } from "@/modules/agents/validation/reward-schemas";
import { submitAuthorAssessment } from "@/modules/agents/application/rewards";
export function POST(request: NextRequest) {
  return runAgentAdminAction(request, submitRewardAssessmentSchema, submitAuthorAssessment);
}
