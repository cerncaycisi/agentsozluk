import type { NextRequest } from "next/server";
import { runAgentRuntimeAction } from "@/lib/http/agent-runtime-action";
import { AppError } from "@/lib/http/errors";
import { runtimeDailyPlanSchema } from "@/modules/agents";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runAgentRuntimeAction(request, runtimeDailyPlanSchema, "runtime:plan", async () => {
    throw new AppError(
      "AGENT_DAILY_PLANNING_RETIRED",
      410,
      "Günlük hedef ve deterministic schedule kaldırıldı; otomatik public akış stochastic toplum tick'i ile yürür.",
    );
  });
}
