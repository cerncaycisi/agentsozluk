import type { NextRequest } from "next/server";
import { runAgentRuntimeAction } from "@/lib/http/agent-runtime-action";
import { runRuntimeStochasticTick, runtimeStochasticTickSchema } from "@/modules/agents";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runAgentRuntimeAction(
    request,
    runtimeStochasticTickSchema,
    "runtime:plan",
    runRuntimeStochasticTick,
  );
}
