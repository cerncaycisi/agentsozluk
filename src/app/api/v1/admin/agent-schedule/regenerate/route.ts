import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { AppError } from "@/lib/http/errors";
import { adminDailyPlanRegenerationSchema } from "@/modules/agents";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runAgentAdminAction(request, adminDailyPlanRegenerationSchema, async () => {
    throw new AppError(
      "AGENT_DAILY_PLANNING_RETIRED",
      410,
      "Günlük hedef ve deterministic schedule kaldırıldı; otomatik public akış stochastic toplum tick'i ile yürür.",
    );
  });
}
