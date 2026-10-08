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
  applyWriterDiversificationD1Target,
  writerDiversificationD1Targets,
} from "@/modules/agents/personas/writer-diversification-d1";
import { lockAgentProfile, lockAgentSettings } from "@/modules/agents/repository/control-plane";
import { resolveOperatorAdmin } from "./agent-operator";

// D1 yazar çeşitlendirmesi: W2 betiğinin kalıbı (DRY_RUN → PAUSE → APPLY → RESUME, snapshot hash).
const confirmation = "APPLY_WRITER_DIVERSIFICATION_D1";
const d1ChangeSummary =
  "D1 çeşitlendirme: kişiliğe göre ayrışan kelime aralığı ve uzunluk sınıfı; ortak ilgi dağıtıldı.";
const terminalRunStatuses = ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "TIMED_OUT"] as const;

const environmentSchema = z
  .object({
    AGENT_WRITER_D1_MODE: z.enum(["DRY_RUN", "PAUSE", "APPLY", "RESUME"]).default("DRY_RUN"),
    AGENT_WRITER_D1_CONFIRMATION: z.string().optional(),
    AGENT_WRITER_D1_EXPECTED_SNAPSHOT_HASH: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    AGENT_OPERATOR_ADMIN_ID: z.string().uuid().optional(),
  })
  .passthrough()
  .superRefine((environment, context) => {
    if (
      environment.AGENT_WRITER_D1_MODE !== "DRY_RUN" &&
      environment.AGENT_WRITER_D1_CONFIRMATION !== confirmation
    ) {
      context.addIssue({ code: "custom", message: "WRITER_D1_CONFIRMATION_REQUIRED" });
    }
    if (
      (environment.AGENT_WRITER_D1_MODE === "APPLY" ||
        environment.AGENT_WRITER_D1_MODE === "RESUME") &&
      !environment.AGENT_WRITER_D1_EXPECTED_SNAPSHOT_HASH
    ) {
      context.addIssue({ code: "custom", message: "WRITER_D1_SNAPSHOT_HASH_REQUIRED" });
    }
  });

const targetByUsername = new Map<string, (typeof writerDiversificationD1Targets)[number]>(
  writerDiversificationD1Targets.map((target) => [target.username, target]),
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
  if (profiles.length !== 36) {
    throw new Error(`WRITER_D1_ACTIVE_COUNT_INVALID count=${profiles.length}`);
  }
  for (const profile of profiles) {
    if (!profile.currentPersonaVersion) {
      throw new Error(`WRITER_D1_PERSONA_MISSING username=${profile.user.username}`);
    }
  }
  const targets = profiles.filter(({ user }) => targetByUsername.has(user.username));
  if (
    targets.length !== writerDiversificationD1Targets.length ||
    JSON.stringify(targets.map(({ user }) => user.username)) !== JSON.stringify(targetUsernames)
  ) {
    throw new Error("WRITER_D1_USERNAME_SET_INVALID");
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
  if (!expected || expected !== actual) throw new Error("WRITER_D1_SNAPSHOT_DRIFT");
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
  for (const target of writerDiversificationD1Targets) {
    const current = universe.get(target.username);
    if (!current) throw new Error(`WRITER_D1_PERSONA_MISSING username=${target.username}`);
    const candidate = applyWriterDiversificationD1Target(current, target);
    assertPinnedPersonaFieldsUnchanged(current, candidate);
    const validated = validatePersonaCandidate(
      candidate,
      [...universe.entries()]
        .filter(([username]) => username !== target.username)
        .map(([, persona]) => persona),
      d1ChangeSummary,
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
    throw new Error(`WRITER_D1_PROFILE_DRIFT username=${before.user.username}`);
  }
}

async function main(): Promise<void> {
  const environment = environmentSchema.parse(process.env);
  const database = getDatabase();
  try {
    const snapshot = await loadSnapshot(database);
    const flow = await loadFlow(database);
    const candidates = prepareCandidates(snapshot);

    if (environment.AGENT_WRITER_D1_MODE === "DRY_RUN") {
      process.stdout.write(
        `${JSON.stringify({
          event: "WRITER_D1_DRY_RUN",
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
    if (environment.AGENT_WRITER_D1_MODE === "PAUSE") {
      if (!flow.settings.runtimeEnabled) throw new Error("WRITER_D1_ALREADY_PAUSED");
      const updated = await setSocietyFlowEnabled(
        database,
        { ...actor, requestId: randomUUID() },
        false,
        { reason: "D1 36 persona sürümünü atomik yayımlamak için kısa duraklama." },
      );
      process.stdout.write(
        `${JSON.stringify({
          event: "WRITER_D1_PAUSED",
          settingsVersion: updated.settingsVersion,
          drainingOpenRunCount: (await loadFlow(database)).openRunCount,
        })}\n`,
      );
      return;
    }

    if (environment.AGENT_WRITER_D1_MODE === "APPLY") {
      assertSnapshot(environment.AGENT_WRITER_D1_EXPECTED_SNAPSHOT_HASH, snapshot.snapshotHash);
      if (
        snapshot.targets.some(
          (profile) =>
            personaHash(profile.currentPersonaVersion!.persona) ===
            personaHash(candidates.get(profile.user.username)!.persona),
        )
      ) {
        throw new Error("WRITER_D1_ALREADY_APPLIED");
      }
      if (flow.settings.runtimeEnabled || flow.openRunCount !== 0) {
        throw new Error(
          `WRITER_D1_APPLY_REQUIRES_PAUSE runtimeEnabled=${flow.settings.runtimeEnabled} openRuns=${flow.openRunCount}`,
        );
      }
      const requestIds: string[] = [];
      await database.$transaction(
        async (transaction) => {
          /*
            Duraklatma şartı ayar kilidi altında yeniden okunur (Sol 6.1 turu): ilk kontrolden sonra
            akış açılırsa ya da yeni koşu başlarsa eski persona sürümüne bağlı koşu kalmasın.
            Kilit sırası updateAgent ve lease ile aynı: önce profiller (kimlik sırasıyla), sonra
            ayar. Ters sıra kilit çevrimi kurar (Sol 6.1 2. tur).
          */
          for (const profileId of snapshot.targets.map(({ id }) => id).sort())
            await lockAgentProfile(transaction, profileId);
          await lockAgentSettings(transaction);
          const lockedFlow = await loadFlow(transaction);
          if (lockedFlow.settings.runtimeEnabled || lockedFlow.openRunCount !== 0)
            throw new Error(
              `WRITER_D1_APPLY_REQUIRES_PAUSE runtimeEnabled=${lockedFlow.settings.runtimeEnabled} openRuns=${lockedFlow.openRunCount}`,
            );
          const lockedSnapshot = await loadSnapshot(transaction);
          assertSnapshot(
            environment.AGENT_WRITER_D1_EXPECTED_SNAPSHOT_HASH,
            lockedSnapshot.snapshotHash,
          );
          const lockedCandidates = prepareCandidates(lockedSnapshot);
          for (const profile of lockedSnapshot.targets) {
            const requestId = randomUUID();
            requestIds.push(requestId);
            await updateAgent(transaction, { ...actor, requestId }, profile.id, {
              expectedPersonaVersion: profile.currentPersonaVersion!.version,
              persona: lockedCandidates.get(profile.user.username)!.persona,
              changeSummary: d1ChangeSummary,
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
          throw new Error(`WRITER_D1_POST_APPLY_INVALID username=${beforeProfile.user.username}`);
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
      const expectedCount = writerDiversificationD1Targets.length;
      if (
        requestIds.length !== expectedCount ||
        auditCount !== expectedCount ||
        outboxCount !== expectedCount
      ) {
        throw new Error(
          `WRITER_D1_RECEIPT_INVALID requests=${requestIds.length} audits=${auditCount} outbox=${outboxCount}`,
        );
      }
      process.stdout.write(
        `${JSON.stringify({
          event: "WRITER_D1_APPLIED",
          targetCount: writerDiversificationD1Targets.length,
          auditCount,
          outboxCount,
          beforeSnapshotHash: snapshot.snapshotHash,
          afterSnapshotHash: after.snapshotHash,
          requestSetHash: sha256(JSON.stringify([...requestIds].sort())),
        })}\n`,
      );
      return;
    }

    if (flow.settings.runtimeEnabled) throw new Error("WRITER_D1_ALREADY_RUNNING");
    // RESUME, APPLY makbuzundaki afterSnapshotHash ile birebir aynı durumu ister (Sol 6.1 2. tur):
    // APPLY sonrası hiçbir persona, ilgi ağırlığı veya profil alanı değişmemiş olmalı.
    assertSnapshot(environment.AGENT_WRITER_D1_EXPECTED_SNAPSHOT_HASH, snapshot.snapshotHash);
    for (const profile of snapshot.targets) {
      if (
        personaHash(profile.currentPersonaVersion!.persona) !==
        personaHash(candidates.get(profile.user.username)!.persona)
      ) {
        throw new Error(`WRITER_D1_RESUME_TARGET_INVALID username=${profile.user.username}`);
      }
    }
    const updated = await setSocietyFlowEnabled(
      database,
      { ...actor, requestId: randomUUID() },
      true,
      { reason: "D1 36 persona sürümü doğrulandı; toplum akışını açma." },
    );
    process.stdout.write(
      `${JSON.stringify({
        event: "WRITER_D1_RESUMED",
        settingsVersion: updated.settingsVersion,
        targetCount: writerDiversificationD1Targets.length,
      })}\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error && /^WRITER_D1_[A-Z0-9_]+(?: .+)?$/u.test(error.message)
      ? error.message
      : "WRITER_D1_FATAL";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
