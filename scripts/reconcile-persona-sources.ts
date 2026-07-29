import "dotenv/config";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { sha256 } from "@/lib/security/crypto";
import { updateAgent } from "@/modules/agents";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import {
  assignVerifiedSources,
  sourceTopicMappings,
  uniqueVerifiedSourcePool,
} from "@/modules/agents/personas/source-assignment";
import { seedPersonaPackSchema, seedPersonaSchema } from "@/modules/agents/personas/schema";
import {
  reconciledSourceLocaleFocus,
  reviewedSourceLocaleFocus,
} from "@/modules/agents/personas/source-locale-metadata";
import { appendRuntimeEvent, lockAgentProfile } from "@/modules/agents/repository/control-plane";
import { appendAuditLog } from "@/modules/audit";
import { resolveOperatorAdmin } from "./agent-operator";

const environmentSchema = z
  .object({
    AGENT_OPERATOR_ADMIN_ID: z.string().uuid().optional(),
    AGENT_SOURCE_RECONCILE_CONFIRMATION: z.literal("RECONCILE_VERIFIED_PERSONA_SOURCES"),
  })
  .passthrough();

const terminalRunStatuses = ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "TIMED_OUT"] as const;

function sourceSnapshot(source: {
  url: string;
  status: string;
  sourceType: string;
  localeFocus: string;
  adminPinned: boolean;
  adminBlocked: boolean;
  consecutiveFailures: number;
}) {
  return {
    urlHash: sha256(source.url),
    status: source.status,
    sourceType: source.sourceType,
    localeFocus: source.localeFocus,
    adminPinned: source.adminPinned,
    adminBlocked: source.adminBlocked,
    consecutiveFailures: source.consecutiveFailures,
  };
}

async function main(): Promise<void> {
  const environment = environmentSchema.parse(process.env);
  const canonicalPack = seedPersonaPackSchema.parse(originalPersonaPack);
  const database = getDatabase();
  try {
    const actor = await resolveOperatorAdmin(database, environment.AGENT_OPERATOR_ADMIN_ID);
    const canonicalUsernames = canonicalPack.personas.map(({ username }) => username);
    const canonicalByUsername = new Map(
      canonicalPack.personas.map((persona) => [persona.username, persona]),
    );
    const verifiedPool = uniqueVerifiedSourcePool(canonicalPack.personas);
    const [settings, openRunCount, profiles] = await Promise.all([
      database.agentGlobalSettings.findUniqueOrThrow({
        where: { id: "global" },
        select: { runtimeEnabled: true },
      }),
      database.agentRun.count({
        where: { runStatus: { notIn: [...terminalRunStatuses] } },
      }),
      database.agentProfile.findMany({
        where: {
          OR: [{ user: { username: { in: canonicalUsernames } } }, { lifecycleStatus: "ACTIVE" }],
        },
        select: {
          id: true,
          user: { select: { username: true } },
          currentPersonaVersion: { select: { persona: true } },
        },
      }),
    ]);
    if (settings.runtimeEnabled || openRunCount > 0)
      throw new Error(
        `SOURCE_RECONCILE_REQUIRES_IDLE_RUNTIME runtimeEnabled=${settings.runtimeEnabled} openRuns=${openRunCount}`,
      );
    const canonicalProfileCount = profiles.filter((profile) =>
      canonicalByUsername.has(profile.user.username),
    ).length;
    if (canonicalProfileCount !== canonicalPack.personas.length)
      throw new Error(
        `SOURCE_RECONCILE_CANONICAL_SET_MISMATCH profiles=${canonicalProfileCount} expected=${canonicalPack.personas.length}`,
      );

    const targets = profiles
      .map((profile) => {
        if (!profile.currentPersonaVersion)
          throw new Error(`SOURCE_RECONCILE_PERSONA_MISSING username=${profile.user.username}`);
        const currentPersona = seedPersonaSchema.parse(profile.currentPersonaVersion.persona);
        const canonical = canonicalByUsername.get(profile.user.username);
        const sources = canonical?.sources ?? assignVerifiedSources(currentPersona, verifiedPool);
        return {
          profile,
          currentPersona,
          sources,
          sourceTopicMappings: canonical?.sourceTopicMappings ?? sourceTopicMappings(sources),
          assignmentKind: canonical ? "CANONICAL" : "ACTIVE_IMPORTED",
        };
      })
      .sort((left, right) => left.profile.user.username.localeCompare(right.profile.user.username));
    let personaVersionsCreated = 0;
    let sourcesCreated = 0;
    let sourcesUpdated = 0;
    let sourcesBlocked = 0;

    for (const target of targets) {
      const { assignmentKind, currentPersona, profile, sources } = target;
      const personaNeedsUpdate =
        JSON.stringify(currentPersona.sources) !== JSON.stringify(sources) ||
        JSON.stringify(currentPersona.sourceTopicMappings) !==
          JSON.stringify(target.sourceTopicMappings);
      if (personaNeedsUpdate) {
        await updateAgent(database, { ...actor, requestId: randomUUID() }, profile.id, {
          persona: {
            ...currentPersona,
            sources,
            sourceTopicMappings: target.sourceTopicMappings,
          },
          changeSummary:
            assignmentKind === "CANONICAL"
              ? "Verified and diversified canonical source pack refresh."
              : "Verified source pool top-up for an active imported writer.",
        });
        personaVersionsCreated += 1;
      }

      const result = await database.$transaction(async (transaction) => {
        await lockAgentProfile(transaction, profile.id);
        const existing = await transaction.agentSource.findMany({
          where: { agentProfileId: profile.id },
        });
        const existingByUrl = new Map(existing.map((source) => [source.url, source]));
        const targetUrls = new Set(sources.map(({ url }) => url));
        let created = 0;
        let updated = 0;
        let blocked = 0;

        for (const source of sources) {
          const before = existingByUrl.get(source.url) ?? null;
          const stored = await transaction.agentSource.upsert({
            where: { agentProfileId_url: { agentProfileId: profile.id, url: source.url } },
            create: {
              agentProfileId: profile.id,
              url: source.url,
              normalizedDomain: new URL(source.url).hostname.toLowerCase(),
              sourceType: source.sourceType,
              status: source.status,
              localeFocus: reviewedSourceLocaleFocus(source.url),
              topics: source.topics,
              trustScore: source.status === "TRUSTED" ? 0.8 : 0.5,
              interestScore: source.weight,
              noveltyScore: 0.5,
              usefulnessScore: 0.5,
              adminPinned: source.pinned,
              adminBlocked: false,
              addedByOrigin: "ADMIN_BASELINE_REFRESH",
            },
            update: {
              normalizedDomain: new URL(source.url).hostname.toLowerCase(),
              sourceType: source.sourceType,
              localeFocus: reconciledSourceLocaleFocus(before?.localeFocus, source.url),
              topics: source.topics,
              interestScore: source.weight,
              adminPinned: source.pinned,
              adminBlocked: false,
              status:
                before && ["TRUSTED", "PROBATION"].includes(before.status)
                  ? before.status
                  : source.status,
              consecutiveFailures: 0,
              lastFetchedAt: null,
            },
          });
          if (before) updated += 1;
          else created += 1;
          await appendRuntimeEvent(transaction, {
            agentProfileId: profile.id,
            eventType: "SOURCE_STATE_CHANGED",
            subject: { type: "SOURCE", id: stored.id },
            safeMessage: before
              ? "Doğrulanmış canonical source kaydı yenilendi."
              : "Doğrulanmış canonical source kaydı eklendi.",
            ...(before ? { before: sourceSnapshot(before) } : {}),
            after: sourceSnapshot(stored),
            metadata: { origin: "ADMIN_BASELINE_REFRESH" },
          });
        }

        for (const source of existing) {
          if (
            targetUrls.has(source.url) ||
            !["INITIAL_PERSONA", "ADMIN_BASELINE_REFRESH"].includes(source.addedByOrigin) ||
            (source.status === "BLOCKED" && source.adminBlocked && !source.adminPinned)
          )
            continue;
          const stored = await transaction.agentSource.update({
            where: { id: source.id },
            data: { status: "BLOCKED", adminBlocked: true, adminPinned: false },
          });
          blocked += 1;
          await appendRuntimeEvent(transaction, {
            agentProfileId: profile.id,
            eventType: "SOURCE_STATE_CHANGED",
            subject: { type: "SOURCE", id: stored.id },
            safeMessage: "Canonical paketten çıkarılan source geçmişi korunarak engellendi.",
            before: sourceSnapshot(source),
            after: sourceSnapshot(stored),
            metadata: { origin: "ADMIN_BASELINE_REFRESH" },
          });
        }

        await appendAuditLog(transaction, {
          actorId: actor.actorId,
          action: "agent.sources.reconciled",
          entityType: "AgentProfile",
          entityId: profile.id,
          requestId: randomUUID(),
          metadata: {
            actorKind: actor.actorKind,
            reason:
              assignmentKind === "CANONICAL"
                ? "Verified and diversified canonical source pack refresh."
                : "Verified source pool top-up for an active imported writer.",
            assignmentKind,
            created,
            updated,
            blocked,
            targetCount: sources.length,
          },
        });
        return { created, updated, blocked };
      });
      sourcesCreated += result.created;
      sourcesUpdated += result.updated;
      sourcesBlocked += result.blocked;
    }

    process.stdout.write(
      `${JSON.stringify({
        status: "SOURCE_RECONCILE_SUCCEEDED",
        personas: targets.length,
        canonicalPersonas: targets.filter(({ assignmentKind }) => assignmentKind === "CANONICAL")
          .length,
        activeImportedPersonas: targets.filter(
          ({ assignmentKind }) => assignmentKind === "ACTIVE_IMPORTED",
        ).length,
        personaVersionsCreated,
        sourcesCreated,
        sourcesUpdated,
        sourcesBlocked,
      })}\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "SOURCE_RECONCILE_FAILED"}\n`);
  process.exitCode = 1;
});
