import "dotenv/config";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { sha256 } from "@/lib/security/crypto";
import { setSocietyFlowEnabled, updateAgent } from "@/modules/agents";
import { assertPinnedPersonaFieldsUnchanged } from "@/modules/agents/domain/persona-evolution";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";
import { seedPersonaSchema } from "@/modules/agents/personas/schema";
import {
  applyWriterNaturalizationW2Target,
  writerNaturalizationW2Targets,
} from "@/modules/agents/personas/writer-naturalization-w2";
import { resolveOperatorAdmin } from "./agent-operator";

const confirmation = "APPLY_WRITER_NATURALIZATION_W2";
const terminalRunStatuses = ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "TIMED_OUT"] as const;

const environmentSchema = z
  .object({
    AGENT_WRITER_W2_MODE: z.enum(["DRY_RUN", "PAUSE", "APPLY", "RESUME"]).default("DRY_RUN"),
    AGENT_WRITER_W2_CONFIRMATION: z.string().optional(),
    AGENT_WRITER_W2_EXPECTED_SNAPSHOT_HASH: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    AGENT_OPERATOR_ADMIN_ID: z.string().uuid().optional(),
  })
  .passthrough()
  .superRefine((environment, context) => {
    if (
      environment.AGENT_WRITER_W2_MODE !== "DRY_RUN" &&
      environment.AGENT_WRITER_W2_CONFIRMATION !== confirmation
    ) {
      context.addIssue({ code: "custom", message: "WRITER_W2_CONFIRMATION_REQUIRED" });
    }
    if (
      environment.AGENT_WRITER_W2_MODE === "APPLY" &&
      !environment.AGENT_WRITER_W2_EXPECTED_SNAPSHOT_HASH
    ) {
      context.addIssue({ code: "custom", message: "WRITER_W2_SNAPSHOT_HASH_REQUIRED" });
    }
  });

const targetByUsername = new Map<string, (typeof writerNaturalizationW2Targets)[number]>(
  writerNaturalizationW2Targets.map((target) => [target.username, target]),
);
const targetUsernames = [...targetByUsername.keys()].sort();

type Executor = Parameters<typeof updateAgent>[0];

function personaHash(persona: unknown): string {
  return sha256(JSON.stringify(seedPersonaSchema.parse(persona)));
}

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
  if (profiles.length !== 22) {
    throw new Error(`WRITER_W2_ACTIVE_COUNT_INVALID count=${profiles.length}`);
  }
  for (const profile of profiles) {
    if (!profile.currentPersonaVersion) {
      throw new Error(`WRITER_W2_PERSONA_MISSING username=${profile.user.username}`);
    }
  }
  const targets = profiles.filter(({ user }) => targetByUsername.has(user.username));
  if (
    targets.length !== writerNaturalizationW2Targets.length ||
    JSON.stringify(targets.map(({ user }) => user.username)) !== JSON.stringify(targetUsernames)
  ) {
    throw new Error("WRITER_W2_USERNAME_SET_INVALID");
  }
  for (const profile of targets) {
    const target = targetByUsername.get(profile.user.username)!;
    if (profile.user.displayName !== target.publicNick) {
      throw new Error(`WRITER_W2_PUBLIC_NICK_DRIFT username=${profile.user.username}`);
    }
  }
  const safeSnapshot = profiles.map((profile) => ({
    profileId: profile.id,
    userId: profile.user.id,
    username: profile.user.username,
    displayNameHash: sha256(profile.user.displayName),
    bioHash: sha256(profile.user.bio ?? ""),
    lifecycleStatus: profile.lifecycleStatus,
    personaVersionId: profile.currentPersonaVersion!.id,
    personaVersion: profile.currentPersonaVersion!.version,
    personaHash: personaHash(profile.currentPersonaVersion!.persona),
    entryCount: profile.user._count.entries,
    credentialHash: sha256(JSON.stringify(profile.credentials)),
    sourceHash: sha256(JSON.stringify(profile.sources)),
  }));
  return {
    profiles,
    targets,
    safeSnapshot,
    snapshotHash: sha256(JSON.stringify(safeSnapshot)),
  };
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
  if (!expected || expected !== actual) throw new Error("WRITER_W2_SNAPSHOT_DRIFT");
}

function prepareCandidates(snapshot: Awaited<ReturnType<typeof loadSnapshot>>) {
  const universe = new Map(
    snapshot.profiles.map((profile) => [
      profile.user.username,
      seedPersonaSchema.parse(profile.currentPersonaVersion!.persona),
    ]),
  );
  const candidates = new Map<
    string,
    {
      persona: ReturnType<typeof seedPersonaSchema.parse>;
      renderedPromptHash: string;
      validationReport: ReturnType<typeof validatePersonaCandidate>["report"];
    }
  >();
  for (const target of writerNaturalizationW2Targets) {
    const current = universe.get(target.username);
    if (!current) throw new Error(`WRITER_W2_PERSONA_MISSING username=${target.username}`);
    const candidate = applyWriterNaturalizationW2Target(current, target);
    assertPinnedPersonaFieldsUnchanged(current, candidate);
    const validated = validatePersonaCandidate(
      candidate,
      [...universe.entries()]
        .filter(([username]) => username !== target.username)
        .map(([, persona]) => persona),
      target.changeSummary,
    );
    candidates.set(target.username, {
      persona: validated.persona,
      renderedPromptHash: sha256(validated.renderedPrompt),
      validationReport: validated.report,
    });
    universe.set(target.username, validated.persona);
  }
  return candidates;
}

function assertUnchangedProfile(
  before: Awaited<ReturnType<typeof loadSnapshot>>["targets"][number],
  after: Awaited<ReturnType<typeof loadSnapshot>>["targets"][number],
) {
  if (
    before.id !== after.id ||
    before.user.id !== after.user.id ||
    before.user.username !== after.user.username ||
    before.user.displayName !== after.user.displayName ||
    before.user.bio !== after.user.bio ||
    before.lifecycleStatus !== after.lifecycleStatus ||
    before.user._count.entries !== after.user._count.entries ||
    JSON.stringify(before.credentials) !== JSON.stringify(after.credentials) ||
    JSON.stringify(before.sources) !== JSON.stringify(after.sources)
  ) {
    throw new Error(`WRITER_W2_PROFILE_DRIFT username=${before.user.username}`);
  }
}

async function main(): Promise<void> {
  const environment = environmentSchema.parse(process.env);
  const database = getDatabase();
  try {
    const snapshot = await loadSnapshot(database);
    const flow = await loadFlow(database);
    const candidates = prepareCandidates(snapshot);

    if (environment.AGENT_WRITER_W2_MODE === "DRY_RUN") {
      process.stdout.write(
        `${JSON.stringify({
          event: "WRITER_W2_DRY_RUN",
          snapshotHash: snapshot.snapshotHash,
          profileCount: snapshot.profiles.length,
          targetCount: snapshot.targets.length,
          settings: flow.settings,
          openRunCount: flow.openRunCount,
          targets: snapshot.targets.map((profile) => {
            const candidate = candidates.get(profile.user.username)!;
            return {
              username: profile.user.username,
              profileId: profile.id,
              currentPersonaVersion: profile.currentPersonaVersion!.version,
              currentPersonaHash: personaHash(profile.currentPersonaVersion!.persona),
              targetPersonaHash: personaHash(candidate.persona),
              changeNeeded:
                personaHash(profile.currentPersonaVersion!.persona) !==
                personaHash(candidate.persona),
              renderedPromptHash: candidate.renderedPromptHash,
              validationReport: candidate.validationReport,
            };
          }),
        })}\n`,
      );
      return;
    }

    const actor = await resolveOperatorAdmin(database, environment.AGENT_OPERATOR_ADMIN_ID);
    if (environment.AGENT_WRITER_W2_MODE === "PAUSE") {
      if (!flow.settings.runtimeEnabled) throw new Error("WRITER_W2_ALREADY_PAUSED");
      const updated = await setSocietyFlowEnabled(
        database,
        { ...actor, requestId: randomUUID() },
        false,
        { reason: "W2 22 persona sürümünü atomik yayımlamak için kısa duraklama." },
      );
      process.stdout.write(
        `${JSON.stringify({
          event: "WRITER_W2_PAUSED",
          settingsVersion: updated.settingsVersion,
          drainingOpenRunCount: (await loadFlow(database)).openRunCount,
        })}\n`,
      );
      return;
    }

    if (environment.AGENT_WRITER_W2_MODE === "APPLY") {
      assertSnapshot(environment.AGENT_WRITER_W2_EXPECTED_SNAPSHOT_HASH, snapshot.snapshotHash);
      if (
        snapshot.targets.some(
          (profile) =>
            personaHash(profile.currentPersonaVersion!.persona) ===
            personaHash(candidates.get(profile.user.username)!.persona),
        )
      ) {
        throw new Error("WRITER_W2_ALREADY_APPLIED");
      }
      if (flow.settings.runtimeEnabled || flow.openRunCount !== 0) {
        throw new Error(
          `WRITER_W2_APPLY_REQUIRES_PAUSE runtimeEnabled=${flow.settings.runtimeEnabled} openRuns=${flow.openRunCount}`,
        );
      }
      const requestIds: string[] = [];
      await database.$transaction(
        async (transaction) => {
          const lockedSnapshot = await loadSnapshot(transaction);
          assertSnapshot(
            environment.AGENT_WRITER_W2_EXPECTED_SNAPSHOT_HASH,
            lockedSnapshot.snapshotHash,
          );
          const lockedCandidates = prepareCandidates(lockedSnapshot);
          for (const profile of lockedSnapshot.targets) {
            const target = targetByUsername.get(profile.user.username)!;
            const requestId = randomUUID();
            requestIds.push(requestId);
            await updateAgent(transaction, { ...actor, requestId }, profile.id, {
              persona: lockedCandidates.get(profile.user.username)!.persona,
              changeSummary: target.changeSummary,
            });
          }
        },
        { timeout: 120_000 },
      );

      const after = await loadSnapshot(database);
      for (let index = 0; index < snapshot.targets.length; index += 1) {
        const beforeProfile = snapshot.targets[index]!;
        const afterProfile = after.targets[index]!;
        assertUnchangedProfile(beforeProfile, afterProfile);
        if (
          afterProfile.currentPersonaVersion!.previousVersionId !==
            beforeProfile.currentPersonaVersion!.id ||
          afterProfile.currentPersonaVersion!.version !==
            beforeProfile.currentPersonaVersion!.version + 1 ||
          personaHash(afterProfile.currentPersonaVersion!.persona) !==
            personaHash(candidates.get(beforeProfile.user.username)!.persona)
        ) {
          throw new Error(`WRITER_W2_POST_APPLY_INVALID username=${beforeProfile.user.username}`);
        }
      }
      const [auditCount, outboxCount] = await Promise.all([
        database.auditLog.count({
          where: { requestId: { in: requestIds }, action: "agent.persona.versioned" },
        }),
        database.outboxEvent.count({
          where: { requestId: { in: requestIds }, eventType: "agent.persona.versioned" },
        }),
      ]);
      const expectedCount = writerNaturalizationW2Targets.length;
      if (
        requestIds.length !== expectedCount ||
        auditCount !== expectedCount ||
        outboxCount !== expectedCount
      ) {
        throw new Error(
          `WRITER_W2_RECEIPT_INVALID requests=${requestIds.length} audits=${auditCount} outbox=${outboxCount}`,
        );
      }
      process.stdout.write(
        `${JSON.stringify({
          event: "WRITER_W2_APPLIED",
          targetCount: writerNaturalizationW2Targets.length,
          auditCount,
          outboxCount,
          beforeSnapshotHash: snapshot.snapshotHash,
          afterSnapshotHash: after.snapshotHash,
          requestSetHash: sha256(JSON.stringify([...requestIds].sort())),
        })}\n`,
      );
      return;
    }

    if (flow.settings.runtimeEnabled) throw new Error("WRITER_W2_ALREADY_RUNNING");
    for (const profile of snapshot.targets) {
      if (
        personaHash(profile.currentPersonaVersion!.persona) !==
        personaHash(candidates.get(profile.user.username)!.persona)
      ) {
        throw new Error(`WRITER_W2_RESUME_TARGET_INVALID username=${profile.user.username}`);
      }
    }
    const updated = await setSocietyFlowEnabled(
      database,
      { ...actor, requestId: randomUUID() },
      true,
      { reason: "W2 22 persona sürümü doğrulandı; toplum akışını açma." },
    );
    process.stdout.write(
      `${JSON.stringify({
        event: "WRITER_W2_RESUMED",
        settingsVersion: updated.settingsVersion,
        targetCount: writerNaturalizationW2Targets.length,
      })}\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error && /^WRITER_W2_[A-Z0-9_]+(?: .+)?$/u.test(error.message)
      ? error.message
      : "WRITER_W2_FATAL";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
