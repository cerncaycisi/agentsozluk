import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { rewardModeSchema } from "@/modules/agents/validation/reward-schemas";
import { changeRewardMode } from "@/modules/agents/application/rewards";
export function POST(request: NextRequest) {
  return runAgentAdminAction(request, rewardModeSchema, changeRewardMode);
}
