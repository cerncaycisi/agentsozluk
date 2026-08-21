import "dotenv/config";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { sha256 } from "@/lib/security/crypto";
import { updateAgent } from "@/modules/agents";
import importedPublicBios from "@/modules/agents/personas/imported-public-bios.json";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import writerNaturalizationW1 from "@/modules/agents/personas/writer-naturalization-w1.json";
import { seedPersonaPackSchema } from "@/modules/agents/personas/schema";
import { resolveOperatorAdmin } from "./agent-operator";

const confirmation = "RECONCILE_PUBLIC_AGENT_BIOS";
const visibleLifecycleStatuses = ["PAUSED", "ACTIVE", "SUSPENDED"] as const;
const terminalRunStatuses = ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "TIMED_OUT"] as const;

const environmentSchema = z
  .object({
    AGENT_OPERATOR_ADMIN_ID: z.string().uuid().optional(),
    AGENT_PUBLIC_BIO_RECONCILE_MODE: z.enum(["DRY_RUN", "APPLY"]).default("DRY_RUN"),
    AGENT_PUBLIC_BIO_RECONCILE_CONFIRMATION: z.string().optional(),
  })
  .passthrough()
  .superRefine((environment, context) => {
    if (
      environment.AGENT_PUBLIC_BIO_RECONCILE_MODE === "APPLY" &&
      environment.AGENT_PUBLIC_BIO_RECONCILE_CONFIRMATION !== confirmation
    ) {
      context.addIssue({
        code: "custom",
        path: ["AGENT_PUBLIC_BIO_RECONCILE_CONFIRMATION"],
        message: "PUBLIC_BIO_RECONCILE_CONFIRMATION_REQUIRED",
      });
    }
  });

const publicBioPackSchema = z.object({
  version: z.literal(1),
  profiles: z
    .array(
      z.object({
        username: z
          .string()
          .trim()
          .min(3)
          .max(40)
          .regex(/^[a-z0-9_]+$/u),
        publicBio: z.string().trim().min(20).max(500),
      }),
    )
    .min(1),
});

function targetPublicBios(): Map<string, string> {
  const canonical = seedPersonaPackSchema
    .parse(originalPersonaPack)
    .personas.map(({ username, publicBio }) => ({ username, publicBio }));
  const imported = publicBioPackSchema.parse(importedPublicBios).profiles;
  const targets = new Map<string, string>();
  for (const target of [...canonical, ...imported]) {
    if (targets.has(target.username))
      throw new Error(`PUBLIC_BIO_TARGET_DUPLICATE username=${target.username}`);
    targets.set(target.username, target.publicBio);
  }
  const w1 = z
    .object({
      version: z.literal(1),
      profiles: z.array(
        z.object({
          username: z.string(),
          publicBio: z.string().trim().min(20).max(500),
        }),
      ),
    })
    .parse(writerNaturalizationW1).profiles;
  for (const target of w1) {
    if (!targets.has(target.username))
      throw new Error(`PUBLIC_BIO_W1_TARGET_UNKNOWN username=${target.username}`);
    targets.set(target.username, target.publicBio);
  }
  return targets;
}

function safeBioReceipt(username: string, currentBio: string, targetBio: string) {
  return {
    username,
    currentHash: sha256(currentBio),
    targetHash: sha256(targetBio),
    currentLength: currentBio.length,
    targetLength: targetBio.length,
    changeNeeded: currentBio !== targetBio,
  };
}

async function main(): Promise<void> {
  const environment = environmentSchema.parse(process.env);
  const targets = targetPublicBios();
  const database = getDatabase();
  try {
    const profiles = await database.agentProfile.findMany({
      where: { lifecycleStatus: { in: [...visibleLifecycleStatuses] } },
      select: {
        id: true,
        lifecycleStatus: true,
        user: { select: { username: true, bio: true } },
        currentPersonaVersion: { select: { version: true } },
      },
      orderBy: { user: { username: "asc" } },
    });
    const missing = profiles
      .map(({ user }) => user.username)
      .filter((username) => !targets.has(username));
    if (missing.length > 0)
      throw new Error(`PUBLIC_BIO_TARGETS_MISSING usernames=${missing.join(",")}`);

    const receipts = profiles.map((profile) => {
      if (!profile.currentPersonaVersion)
        throw new Error(`PUBLIC_BIO_PERSONA_MISSING username=${profile.user.username}`);
      const targetBio = targets.get(profile.user.username)!;
      return {
        profile,
        targetBio,
        receipt: safeBioReceipt(profile.user.username, profile.user.bio ?? "", targetBio),
      };
    });
    process.stdout.write(
      `${JSON.stringify({
        event: "PUBLIC_BIO_RECONCILE_START",
        mode: environment.AGENT_PUBLIC_BIO_RECONCILE_MODE,
        profileCount: receipts.length,
        changeCount: receipts.filter(({ receipt }) => receipt.changeNeeded).length,
      })}\n`,
    );
    for (const { profile, receipt } of receipts)
      process.stdout.write(
        `${JSON.stringify({ ...receipt, lifecycleStatus: profile.lifecycleStatus })}\n`,
      );

    if (environment.AGENT_PUBLIC_BIO_RECONCILE_MODE === "APPLY") {
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
            `PUBLIC_BIO_RECONCILE_REQUIRES_IDLE_RUNTIME runtimeEnabled=${settings.runtimeEnabled} openRuns=${openRunCount}`,
          );
        for (const { profile, receipt, targetBio } of receipts) {
          if (!receipt.changeNeeded) continue;
          await updateAgent(transaction, { ...actor, requestId: randomUUID() }, profile.id, {
            expectedPersonaVersion: profile.currentPersonaVersion!.version,
            publicBio: targetBio,
            changeSummary: "Public bio rewritten in the writer's own everyday voice.",
          });
        }
      });
    }

    process.stdout.write(
      `${JSON.stringify({
        event: "PUBLIC_BIO_RECONCILE_END",
        mode: environment.AGENT_PUBLIC_BIO_RECONCILE_MODE,
        profileCount: receipts.length,
        changed:
          environment.AGENT_PUBLIC_BIO_RECONCILE_MODE === "APPLY"
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
    error instanceof Error && /^PUBLIC_BIO_[A-Z0-9_]+(?: .+)?$/u.test(error.message)
      ? error.message
      : "PUBLIC_BIO_RECONCILE_FATAL";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
