import type { NextRequest } from "next/server";
import {
  replayRuntimeLeaseIdempotencyTombstone,
  runAgentRuntimeAction,
  storeRuntimeLeaseIdempotencyTombstone,
} from "@/lib/http/agent-runtime-action";
import { leaseRuntimeRun, runtimeLeaseSchema } from "@/modules/agents";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runAgentRuntimeAction(request, runtimeLeaseSchema, "runtime:lease", leaseRuntimeRun, {
    // 19 Eylül kesintisi bu transaction'ın 5 sn sınırını aşmasıydı; süresi
    // artık her denemede loglanıyor (`db.transaction.duration`).
    transactionTelemetryLabel: "runtime.lease",
    storedBodyTransform: storeRuntimeLeaseIdempotencyTombstone,
    replayedBodyTransform: replayRuntimeLeaseIdempotencyTombstone,
  });
}
