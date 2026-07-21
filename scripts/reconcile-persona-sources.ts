import "dotenv/config";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { sha256 } from "@/lib/security/crypto";
import { updateAgent } from "@/modules/agents";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { seedPersonaPackSchema, seedPersonaSchema } from "@/modules/agents/personas/schema";
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
  adminPinned: boolean;
  adminBlocked: boolean;
  consecutiveFailures: number;
}) {
  return {
    urlHash: sha256(source.url),
    status: source.status,
    sourceType: source.sourceType,
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
          user: {
            username: { in: canonicalPack.personas.map(({ username }) => username) },
          },
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
    if (profiles.length !== canonicalPack.personas.length)
      throw new Error(
        `SOURCE_RECONCILE_CANONICAL_SET_MISMATCH profiles=${profiles.length} expected=${canonicalPack.personas.length}`,
      );

    const profileByUsername = new Map(profiles.map((profile) => [profile.user.username, profile]));
    let personaVersionsCreated = 0;
    let sourcesCreated = 0;
    let sourcesUpdated = 0;
    let sourcesBlocked = 0;

    for (const canonical of canonicalPack.personas) {
      const profile = profileByUsername.get(canonical.username);
      if (!profile?.currentPersonaVersion)
        throw new Error(`SOURCE_RECONCILE_PERSONA_MISSING username=${canonical.username}`);
      const currentPersona = seedPersonaSchema.parse(profile.currentPersonaVersion.persona);
      const personaNeedsUpdate =
        JSON.stringify(currentPersona.sources) !== JSON.stringify(canonical.sources) ||
        JSON.stringify(currentPersona.sourceTopicMappings) !==
          JSON.stringify(canonical.sourceTopicMappings);
      if (personaNeedsUpdate) {
        await updateAgent(database, { ...actor, requestId: randomUUID() }, profile.id, {
          persona: {
            ...currentPersona,
            sources: canonical.sources,
            sourceTopicMappings: canonical.sourceTopicMappings,
          },
          changeSummary: "Verified and diversified canonical source pack refresh.",
        });
        personaVersionsCreated += 1;
      }

      const result = await database.$transaction(async (transaction) => {
        await lockAgentProfile(transaction, profile.id);
        const existing = await transaction.agentSource.findMany({
          where: { agentProfileId: profile.id },
        });
        const existingByUrl = new Map(existing.map((source) => [source.url, source]));
        const canonicalUrls = new Set(canonical.sources.map(({ url }) => url));
        let created = 0;
        let updated = 0;
        let blocked = 0;

        for (const source of canonical.sources) {
          const before = existingByUrl.get(source.url) ?? null;
          const stored = await transaction.agentSource.upsert({
            where: { agentProfileId_url: { agentProfileId: profile.id, url: source.url } },
            create: {
              agentProfileId: profile.id,
              url: source.url,
              normalizedDomain: new URL(source.url).hostname.toLowerCase(),
              sourceType: source.sourceType,
              status: source.status,
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
            canonicalUrls.has(source.url) ||
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
            reason: "Verified and diversified canonical source pack refresh.",
            created,
            updated,
            blocked,
            canonicalCount: canonical.sources.length,
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
        personas: profiles.length,
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
