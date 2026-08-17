import "dotenv/config";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { sha256 } from "@/lib/security/crypto";
import { setSocietyFlowEnabled, updateAgent } from "@/modules/agents";
import targetsJson from "@/modules/agents/personas/writer-naturalization-w1.json";
import { displayNameSchema } from "@/modules/auth/validation/schemas";
import { resolveOperatorAdmin } from "./agent-operator";

const confirmation = "APPLY_WRITER_NATURALIZATION_W1";
const expectedHead = "966449fd2adf5eeb6880465e66e46524286454b6";
const terminalRunStatuses = ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "TIMED_OUT"] as const;

const targetSchema = z.object({
  version: z.literal(1),
  profiles: z
    .array(
      z.object({
        username: z.string().regex(/^[a-z0-9_]{3,30}$/u),
        currentDisplayName: displayNameSchema,
        displayName: displayNameSchema,
        publicSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
        publicBio: z.string().trim().min(20).max(500),
      }),
    )
    .length(22)
    .superRefine((profiles, context) => {
      for (const field of ["username", "displayName"] as const) {
        const values = profiles.map((profile) => profile[field]);
        if (new Set(values).size !== values.length)
          context.addIssue({ code: "custom", message: `WRITER_W1_DUPLICATE_${field}` });
      }
    }),
});

const environmentSchema = z
  .object({
    AGENT_WRITER_W1_MODE: z.enum(["DRY_RUN", "PAUSE", "APPLY", "RESUME"]).default("DRY_RUN"),
    AGENT_WRITER_W1_CONFIRMATION: z.string().optional(),
    AGENT_WRITER_W1_EXPECTED_SNAPSHOT_HASH: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    AGENT_WRITER_W1_EXPECTED_HEAD: z.literal(expectedHead).optional(),
    AGENT_OPERATOR_ADMIN_ID: z.string().uuid().optional(),
  })
  .passthrough()
  .superRefine((environment, context) => {
    if (environment.AGENT_WRITER_W1_MODE !== "DRY_RUN") {
      if (environment.AGENT_WRITER_W1_CONFIRMATION !== confirmation)
        context.addIssue({ code: "custom", message: "WRITER_W1_CONFIRMATION_REQUIRED" });
      if (environment.AGENT_WRITER_W1_EXPECTED_HEAD !== expectedHead)
        context.addIssue({ code: "custom", message: "WRITER_W1_HEAD_CONFIRMATION_REQUIRED" });
    }
    if (
      environment.AGENT_WRITER_W1_MODE === "APPLY" &&
      !environment.AGENT_WRITER_W1_EXPECTED_SNAPSHOT_HASH
    )
      context.addIssue({ code: "custom", message: "WRITER_W1_SNAPSHOT_HASH_REQUIRED" });
  });

const targets = targetSchema.parse(targetsJson).profiles;
const targetByUsername = new Map(targets.map((target) => [target.username, target]));

type Executor = Parameters<typeof updateAgent>[0];

async function loadSnapshot(database: Executor) {
  const profiles = await database.agentProfile.findMany({
    where: { lifecycleStatus: "ACTIVE" },
    select: {
      id: true,
      lifecycleStatus: true,
      currentPersonaVersion: {
        select: { id: true, version: true, previousVersionId: true, persona: true },
      },
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          bio: true,
          _count: { select: { entries: true } },
        },
      },
      credentials: {
        select: { id: true, scopes: true, expiresAt: true, revokedAt: true },
        orderBy: { id: "asc" },
      },
      sources: {
        select: { id: true, status: true, normalizedDomain: true, adminBlocked: true },
        orderBy: { id: "asc" },
      },
    },
    orderBy: { user: { username: "asc" } },
  });
  if (profiles.length !== 22)
    throw new Error(`WRITER_W1_ACTIVE_COUNT_INVALID count=${profiles.length}`);
  const usernames = profiles.map(({ user }) => user.username);
  const expectedUsernames = [...targetByUsername.keys()].sort();
  if (JSON.stringify(usernames) !== JSON.stringify(expectedUsernames))
    throw new Error("WRITER_W1_USERNAME_SET_INVALID");
  for (const profile of profiles) {
    if (!profile.currentPersonaVersion)
      throw new Error(`WRITER_W1_PERSONA_MISSING username=${profile.user.username}`);
  }
  const safeSnapshot = profiles.map((profile) => ({
    profileId: profile.id,
    userId: profile.user.id,
    username: profile.user.username,
    displayName: profile.user.displayName,
    bioHash: sha256(profile.user.bio ?? ""),
    lifecycleStatus: profile.lifecycleStatus,
    personaVersionId: profile.currentPersonaVersion!.id,
    personaVersion: profile.currentPersonaVersion!.version,
    personaHash: sha256(JSON.stringify(profile.currentPersonaVersion!.persona)),
    entryCount: profile.user._count.entries,
    credentialHash: sha256(JSON.stringify(profile.credentials)),
    sourceHash: sha256(JSON.stringify(profile.sources)),
  }));
  return { profiles, safeSnapshot, snapshotHash: sha256(JSON.stringify(safeSnapshot)) };
}

async function loadFlow(database: Executor) {
  const [settings, openRunCount] = await Promise.all([
    database.agentGlobalSettings.findUniqueOrThrow({
      where: { id: "global" },
      select: {
        settingsVersion: true,
        runtimeEnabled: true,
        schedulerEnabled: true,
        publishEnabled: true,
        publicWriteEnabled: true,
        runtimeOperatingMode: true,
      },
    }),
    database.agentRun.count({ where: { runStatus: { notIn: [...terminalRunStatuses] } } }),
  ]);
  return { settings, openRunCount };
}

function assertSnapshot(expected: string | undefined, actual: string) {
  if (!expected || expected !== actual) throw new Error("WRITER_W1_SNAPSHOT_DRIFT");
}

function assertTargetBaseline(snapshot: Awaited<ReturnType<typeof loadSnapshot>>) {
  for (const profile of snapshot.profiles) {
    const target = targetByUsername.get(profile.user.username)!;
    const alreadyTarget =
      profile.user.displayName === target.displayName && profile.user.bio === target.publicBio;
    const exactOldName = profile.user.displayName === target.currentDisplayName;
    if (!alreadyTarget && !exactOldName)
      throw new Error(`WRITER_W1_DISPLAY_NAME_DRIFT username=${profile.user.username}`);
  }
}

function emitDryRun(
  snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
  flow: Awaited<ReturnType<typeof loadFlow>>,
) {
  const rows = snapshot.profiles.map((profile) => {
    const target = targetByUsername.get(profile.user.username)!;
    const currentBio = profile.user.bio ?? "";
    return {
      username: profile.user.username,
      profileId: profile.id,
      currentDisplayNameHash: sha256(profile.user.displayName),
      targetDisplayNameHash: sha256(target.displayName),
      currentBioHash: sha256(currentBio),
      targetBioHash: sha256(target.publicBio),
      displayNameChangeNeeded: profile.user.displayName !== target.displayName,
      bioChangeNeeded: currentBio !== target.publicBio,
      entryCount: profile.user._count.entries,
      personaVersion: profile.currentPersonaVersion!.version,
    };
  });
  process.stdout.write(
    `${JSON.stringify({
      event: "WRITER_W1_DRY_RUN",
      expectedHead,
      snapshotHash: snapshot.snapshotHash,
      profileCount: rows.length,
      changeCount: rows.filter((row) => row.displayNameChangeNeeded || row.bioChangeNeeded).length,
      settings: flow.settings,
      openRunCount: flow.openRunCount,
      rows,
    })}\n`,
  );
}

async function main(): Promise<void> {
  const environment = environmentSchema.parse(process.env);
  const database = getDatabase();
  try {
    const snapshot = await loadSnapshot(database);
    const flow = await loadFlow(database);
    assertTargetBaseline(snapshot);
    if (environment.AGENT_WRITER_W1_MODE === "DRY_RUN") {
      emitDryRun(snapshot, flow);
      return;
    }
    const actor = await resolveOperatorAdmin(database, environment.AGENT_OPERATOR_ADMIN_ID);

    if (environment.AGENT_WRITER_W1_MODE === "PAUSE") {
      if (!flow.settings.runtimeEnabled) throw new Error("WRITER_W1_ALREADY_PAUSED");
      const updated = await setSocietyFlowEnabled(
        database,
        { ...actor, requestId: randomUUID() },
        false,
        { reason: "W1 yazar görünen ad ve bio güncellemesi için kısa atomik duraklama." },
      );
      const after = await loadFlow(database);
      process.stdout.write(
        `${JSON.stringify({
          event: "WRITER_W1_PAUSED",
          settingsVersion: updated.settingsVersion,
          drainingOpenRunCount: after.openRunCount,
        })}\n`,
      );
      return;
    }

    if (environment.AGENT_WRITER_W1_MODE === "APPLY") {
      assertSnapshot(environment.AGENT_WRITER_W1_EXPECTED_SNAPSHOT_HASH, snapshot.snapshotHash);
      if (flow.settings.runtimeEnabled || flow.openRunCount !== 0)
        throw new Error(
          `WRITER_W1_APPLY_REQUIRES_PAUSE runtimeEnabled=${flow.settings.runtimeEnabled} openRuns=${flow.openRunCount}`,
        );
      const requestIds: string[] = [];
      await database.$transaction(
        async (transaction) => {
          const lockedSnapshot = await loadSnapshot(transaction);
          assertSnapshot(
            environment.AGENT_WRITER_W1_EXPECTED_SNAPSHOT_HASH,
            lockedSnapshot.snapshotHash,
          );
          for (const profile of lockedSnapshot.profiles) {
            const target = targetByUsername.get(profile.user.username)!;
            const requestId = randomUUID();
            requestIds.push(requestId);
            await updateAgent(transaction, { ...actor, requestId }, profile.id, {
              displayName: target.displayName,
              publicBio: target.publicBio,
              changeSummary: "W1 kapsamında onaylanan doğal görünen ad ve public bio güncellemesi.",
            });
          }
        },
        { timeout: 120_000 },
      );
      const after = await loadSnapshot(database);
      for (let index = 0; index < snapshot.profiles.length; index += 1) {
        const beforeProfile = snapshot.profiles[index]!;
        const afterProfile = after.profiles[index]!;
        const target = targetByUsername.get(beforeProfile.user.username)!;
        if (
          beforeProfile.id !== afterProfile.id ||
          beforeProfile.user.id !== afterProfile.user.id ||
          beforeProfile.user.username !== afterProfile.user.username ||
          beforeProfile.lifecycleStatus !== afterProfile.lifecycleStatus ||
          beforeProfile.user._count.entries !== afterProfile.user._count.entries ||
          JSON.stringify(beforeProfile.credentials) !== JSON.stringify(afterProfile.credentials) ||
          JSON.stringify(beforeProfile.sources) !== JSON.stringify(afterProfile.sources) ||
          afterProfile.user.displayName !== target.displayName ||
          afterProfile.user.bio !== target.publicBio ||
          afterProfile.currentPersonaVersion!.previousVersionId !==
            beforeProfile.currentPersonaVersion!.id ||
          afterProfile.currentPersonaVersion!.version !==
            beforeProfile.currentPersonaVersion!.version + 1
        )
          throw new Error(`WRITER_W1_POST_APPLY_INVALID username=${beforeProfile.user.username}`);
        const persona = z
          .object({ displayName: z.string(), publicBio: z.string() })
          .passthrough()
          .parse(afterProfile.currentPersonaVersion!.persona);
        if (persona.displayName !== target.displayName || persona.publicBio !== target.publicBio)
          throw new Error(
            `WRITER_W1_PERSONA_TARGET_INVALID username=${beforeProfile.user.username}`,
          );
      }
      const [auditCount, outboxCount] = await Promise.all([
        database.auditLog.count({
          where: { requestId: { in: requestIds }, action: "agent.persona.versioned" },
        }),
        database.outboxEvent.count({
          where: { requestId: { in: requestIds }, eventType: "agent.persona.versioned" },
        }),
      ]);
      if (requestIds.length !== 22 || auditCount !== 22 || outboxCount !== 22)
        throw new Error(
          `WRITER_W1_RECEIPT_INVALID requests=${requestIds.length} audits=${auditCount} outbox=${outboxCount}`,
        );
      process.stdout.write(
        `${JSON.stringify({
          event: "WRITER_W1_APPLIED",
          profileCount: 22,
          auditCount,
          outboxCount,
          beforeSnapshotHash: snapshot.snapshotHash,
          afterSnapshotHash: after.snapshotHash,
          requestSetHash: sha256(JSON.stringify([...requestIds].sort())),
        })}\n`,
      );
      return;
    }

    const targetCount = snapshot.profiles.filter((profile) => {
      const target = targetByUsername.get(profile.user.username)!;
      return (
        profile.user.displayName === target.displayName && profile.user.bio === target.publicBio
      );
    }).length;
    if (targetCount !== 22) throw new Error(`WRITER_W1_RESUME_TARGET_INVALID count=${targetCount}`);
    if (flow.settings.runtimeEnabled) throw new Error("WRITER_W1_ALREADY_RUNNING");
    const updated = await setSocietyFlowEnabled(
      database,
      { ...actor, requestId: randomUUID() },
      true,
      { reason: "W1 yazar görünen ad ve bio güncellemesi tamamlandı; toplum akışını açma." },
    );
    process.stdout.write(
      `${JSON.stringify({ event: "WRITER_W1_RESUMED", settingsVersion: updated.settingsVersion, profileCount: 22 })}\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error && /^WRITER_W1_[A-Z0-9_]+(?: .+)?$/u.test(error.message)
      ? error.message
      : "WRITER_W1_FATAL";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
