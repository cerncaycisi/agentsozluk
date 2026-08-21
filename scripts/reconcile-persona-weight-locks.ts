import "dotenv/config";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { sha256 } from "@/lib/security/crypto";
import { unlockPersonaWeightLocks, updateAgent } from "@/modules/agents";
import { seedPersonaSchema } from "@/modules/agents/personas/schema";
import { resolveOperatorAdmin } from "./agent-operator";

const confirmation = "UNLOCK_PERSONA_EVOLUTION_WEIGHTS";
const visibleLifecycleStatuses = ["PAUSED", "ACTIVE", "SUSPENDED"] as const;
const terminalRunStatuses = ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "TIMED_OUT"] as const;

const environmentSchema = z
  .object({
    AGENT_OPERATOR_ADMIN_ID: z.string().uuid().optional(),
    AGENT_PERSONA_WEIGHT_UNLOCK_MODE: z.enum(["DRY_RUN", "APPLY"]).default("DRY_RUN"),
    AGENT_PERSONA_WEIGHT_UNLOCK_CONFIRMATION: z.string().optional(),
  })
  .passthrough()
  .superRefine((environment, context) => {
    if (
      environment.AGENT_PERSONA_WEIGHT_UNLOCK_MODE === "APPLY" &&
      environment.AGENT_PERSONA_WEIGHT_UNLOCK_CONFIRMATION !== confirmation
    )
      context.addIssue({
        code: "custom",
        path: ["AGENT_PERSONA_WEIGHT_UNLOCK_CONFIRMATION"],
        message: "PERSONA_WEIGHT_UNLOCK_CONFIRMATION_REQUIRED",
      });
  });

function weightLockCount(personaInput: unknown): number {
  unlockPersonaWeightLocks(personaInput);
  const source =
    personaInput && typeof personaInput === "object" && !Array.isArray(personaInput)
      ? (personaInput as Record<string, unknown>)
      : {};
  const weightedCollections = ["interests", "coreValues"].flatMap((key) => {
    const value = source[key];
    return Array.isArray(value) ? value : [];
  });
  const pinnedItems = weightedCollections.filter(
    (item) =>
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      (item as Record<string, unknown>).pinned === true,
  ).length;
  const evolution =
    source.evolution && typeof source.evolution === "object" && !Array.isArray(source.evolution)
      ? (source.evolution as Record<string, unknown>)
      : {};
  const pinnedFields = Array.isArray(evolution.pinnedFields) ? evolution.pinnedFields : [];
  const nonIdentityPinnedPaths = pinnedFields.filter(
    (path) => typeof path === "string" && !["username", "identity.biography"].includes(path),
  ).length;
  return pinnedItems + nonIdentityPinnedPaths;
}

async function main(): Promise<void> {
  const environment = environmentSchema.parse(process.env);
  const database = getDatabase();
  try {
    const profiles = await database.agentProfile.findMany({
      where: { lifecycleStatus: { in: [...visibleLifecycleStatuses] } },
      orderBy: { user: { username: "asc" } },
      select: {
        id: true,
        lifecycleStatus: true,
        user: { select: { username: true } },
        currentPersonaVersion: { select: { persona: true, version: true } },
      },
    });
    const receipts = profiles.map((profile) => {
      if (!profile.currentPersonaVersion)
        throw new Error(`PERSONA_WEIGHT_UNLOCK_PERSONA_MISSING username=${profile.user.username}`);
      const current = seedPersonaSchema.parse(profile.currentPersonaVersion.persona);
      const target = unlockPersonaWeightLocks(current);
      const currentHash = sha256(JSON.stringify(current));
      const targetHash = sha256(JSON.stringify(target));
      return {
        profile,
        target,
        receipt: {
          username: profile.user.username,
          lifecycleStatus: profile.lifecycleStatus,
          currentVersion: profile.currentPersonaVersion.version,
          currentHash,
          targetHash,
          currentWeightLockCount: weightLockCount(current),
          targetWeightLockCount: weightLockCount(target),
          changeNeeded: !isDeepStrictEqual(current, target),
        },
      };
    });
    process.stdout.write(
      `${JSON.stringify({
        event: "PERSONA_WEIGHT_UNLOCK_START",
        mode: environment.AGENT_PERSONA_WEIGHT_UNLOCK_MODE,
        profileCount: receipts.length,
        changeCount: receipts.filter(({ receipt }) => receipt.changeNeeded).length,
      })}\n`,
    );
    for (const { receipt } of receipts) process.stdout.write(`${JSON.stringify(receipt)}\n`);

    if (environment.AGENT_PERSONA_WEIGHT_UNLOCK_MODE === "APPLY") {
      const actor = await resolveOperatorAdmin(database, environment.AGENT_OPERATOR_ADMIN_ID);
      await database.$transaction(async (transaction) => {
        const [settings, openRunCount] = await Promise.all([
          transaction.agentGlobalSettings.findUniqueOrThrow({
            where: { id: "global" },
            select: { runtimeEnabled: true },
          }),
          transaction.agentRun.count({
            where: { runStatus: { notIn: [...terminalRunStatuses] } },
          }),
        ]);
        if (settings.runtimeEnabled || openRunCount > 0)
          throw new Error(
            `PERSONA_WEIGHT_UNLOCK_REQUIRES_IDLE_RUNTIME runtimeEnabled=${settings.runtimeEnabled} openRuns=${openRunCount}`,
          );
        for (const { profile, receipt, target } of receipts) {
          if (!receipt.changeNeeded) continue;
          await updateAgent(transaction, { ...actor, requestId: randomUUID() }, profile.id, {
            expectedPersonaVersion: receipt.currentVersion,
            persona: target,
            changeSummary:
              "Persona evolution weight locks removed; identity and safety invariants preserved.",
          });
        }
      });
    }

    process.stdout.write(
      `${JSON.stringify({
        event: "PERSONA_WEIGHT_UNLOCK_END",
        mode: environment.AGENT_PERSONA_WEIGHT_UNLOCK_MODE,
        profileCount: receipts.length,
        changed:
          environment.AGENT_PERSONA_WEIGHT_UNLOCK_MODE === "APPLY"
            ? receipts.filter(({ receipt }) => receipt.changeNeeded).length
            : 0,
        pending: receipts.filter(({ receipt }) => receipt.changeNeeded).length,
      })}\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error && /^PERSONA_WEIGHT_UNLOCK_[A-Z0-9_]+(?: .+)?$/u.test(error.message)
      ? error.message
      : "PERSONA_WEIGHT_UNLOCK_FATAL";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
