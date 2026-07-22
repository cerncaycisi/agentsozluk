import "dotenv/config";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import {
  abortProductionRolloutAttempt,
  cancelAllPendingWriteAgentRuns,
  retireAgentDailyPlanning,
  setGlobalRuntimeEnabled,
} from "@/modules/agents";
import { resolveOperatorAdmin } from "./agent-operator";

const environmentSchema = z
  .object({
    AGENT_OPERATOR_ENV_FILE: z.string().min(1).optional(),
    AGENT_OPERATOR_ADMIN_ID: z.string().uuid().optional(),
    AGENT_DB_IP: z.string().min(1).optional(),
  })
  .passthrough();

const argumentsSchema = z.object({ expectedAttemptId: z.string().uuid() });

function parseArguments() {
  const expectedAttemptId = process.argv[2];
  return argumentsSchema.parse({ expectedAttemptId });
}

async function main(): Promise<void> {
  const { expectedAttemptId } = parseArguments();
  if (process.env.AGENT_OPERATOR_ENV_FILE) process.loadEnvFile(process.env.AGENT_OPERATOR_ENV_FILE);
  if (process.env.AGENT_DB_IP && process.env.DATABASE_URL) {
    const databaseUrl = new URL(process.env.DATABASE_URL);
    databaseUrl.hostname = process.env.AGENT_DB_IP;
    process.env.DATABASE_URL = databaseUrl.toString();
  }
  const environment = environmentSchema.parse(process.env);
  const database = getDatabase();
  try {
    const baseActor = await resolveOperatorAdmin(database, environment.AGENT_OPERATOR_ADMIN_ID);
    const actor = () => ({ ...baseActor, requestId: randomUUID() });
    const before = await database.agentGlobalSettings.findUniqueOrThrow({
      where: { id: "global" },
      select: { runtimeEnabled: true },
    });
    if (before.runtimeEnabled) throw new Error("RECOVERY_REQUIRES_PAUSED_RUNTIME");

    const cancellation = await cancelAllPendingWriteAgentRuns(database, actor(), {
      reason: "Retire stale deterministic queue before stochastic runtime recovery.",
      confirmation: "CANCEL_ALL_PENDING_WRITE_RUNS",
    });
    const retirement = await retireAgentDailyPlanning(database, actor(), {
      reason: "Retire daily targets, planned slots and catch-up state before stochastic resume.",
    });

    const latestAttempt = await database.agentRuntimeEvent.findFirst({
      where: {
        eventType: {
          in: [
            "runtime.production.rollout_attempt.started",
            "runtime.production.rollout_attempt.aborted",
            "runtime.production.rollout_attempt.completed",
          ],
        },
        agentProfileId: null,
        runId: null,
        actionId: null,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { eventType: true, metadata: true },
    });
    const metadata =
      latestAttempt?.metadata &&
      typeof latestAttempt.metadata === "object" &&
      !Array.isArray(latestAttempt.metadata)
        ? (latestAttempt.metadata as Record<string, unknown>)
        : null;
    if (metadata?.attemptId !== expectedAttemptId) throw new Error("RECOVERY_ATTEMPT_ID_MISMATCH");

    let rolloutStatus = "ALREADY_TERMINAL";
    if (latestAttempt?.eventType === "runtime.production.rollout_attempt.started") {
      const aborted = await abortProductionRolloutAttempt(database, actor(), {
        attemptId: expectedAttemptId,
        commandId: randomUUID(),
        reasonCode: "DAY0_ABORT",
      });
      rolloutStatus = aborted.status;
    } else if (latestAttempt?.eventType !== "runtime.production.rollout_attempt.aborted") {
      throw new Error("RECOVERY_ROLLOUT_NOT_ABORTABLE");
    }

    const resumed = await setGlobalRuntimeEnabled(database, actor(), true, {
      reason: "Resume continuous stochastic society after retiring daily planning state.",
    });
    process.stdout.write(
      `${JSON.stringify({
        cancelledQueuedRuns: cancellation.count,
        cancelledPlans: retirement.cancelledPlans,
        cancelledSlots: retirement.cancelledSlots,
        clearedRuntimeStates: retirement.clearedRuntimeStates,
        rolloutStatus,
        runtimeEnabled: resumed.runtimeEnabled,
      })}\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "STOCHASTIC_RUNTIME_RECOVERY_FAILED"}\n`,
  );
  process.exitCode = 1;
});
