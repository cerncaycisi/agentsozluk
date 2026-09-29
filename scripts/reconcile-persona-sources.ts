import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { sha256 } from "@/lib/security/crypto";
import { requireAgentAdminInTransaction, updateAgent } from "@/modules/agents";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { expandedVerifiedSources } from "@/modules/agents/personas/expanded-sources";
import {
  runtimeAgentSourceLimit,
  runtimeSourceHolderLimit,
} from "@/modules/agents/domain/runtime-source-candidates";
import {
  planDiverseSourceAssignment,
  sourceInterestAffinity,
  reconciledCanonicalAdminPinned,
  sourceTopicMappings,
  uniqueVerifiedSourcePool,
} from "@/modules/agents/personas/source-assignment";
import { seedPersonaPackSchema, seedPersonaSchema } from "@/modules/agents/personas/schema";
import {
  reconciledSourceLocaleFocus,
  reviewedSourceLocaleFocus,
} from "@/modules/agents/personas/source-locale-metadata";
import {
  appendRuntimeEvent,
  lockAgentProfile,
  lockAgentSettings,
} from "@/modules/agents/repository/control-plane";
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

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? Object.fromEntries(
          Object.entries(nested as Record<string, unknown>).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        )
      : nested,
  );
}

const sourceStateSelect = {
  id: true,
  agentProfileId: true,
  url: true,
  status: true,
  adminBlocked: true,
  adminPinned: true,
  addedByOrigin: true,
  topics: true,
} as const;

function sourceIsActive(row: { status: string; adminBlocked: boolean }): boolean {
  return !row.adminBlocked && !["REJECTED", "BLOCKED"].includes(row.status);
}

// Çalışma zamanı sayımıyla aynı: engelsiz, REJECTED/BLOCKED olmayan satırlar; (profil, url) tekil.
async function runtimeHolderCounts(
  transaction: Prisma.TransactionClient,
  profileFilter?: { notIn: string[] },
): Promise<Map<string, number>> {
  const groups = await transaction.agentSource.groupBy({
    by: ["url"],
    where: {
      adminBlocked: false,
      status: { notIn: ["REJECTED", "BLOCKED"] },
      ...(profileFilter ? { agentProfileId: profileFilter } : {}),
    },
    _count: { _all: true },
  });
  return new Map(groups.map((group) => [group.url, group._count._all]));
}

const personaSourceLimit = 20;
const reconciledSourceMinimum = 10;

// Son denetim başarısızsa işlem geri alınır; güvenli özet stdout'a yazılır.
class ReconcileRejected extends Error {
  constructor(readonly payload: Record<string, unknown>) {
    super(String(payload.status));
  }
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
    // Paket havuzu + genişletilmiş doğrulanmış havuz (29 Eylül 2026, `expanded-sources.ts`).
    const verifiedPool = [...uniqueVerifiedSourcePool(canonicalPack.personas)];
    for (const source of expandedVerifiedSources)
      if (!verifiedPool.some(({ url }) => url === source.url)) verifiedPool.push(source);
    const summary = await database.$transaction(
      async (transaction) => {
        await requireAgentAdminInTransaction(transaction, actor);
        // Kilit sırası yönetici yollarıyla aynı: önce profiller (kimlik sırasıyla), sonra ayarlar.
        for (const { id } of await transaction.agentProfile.findMany({
          select: { id: true },
          orderBy: { id: "asc" },
        }))
          await lockAgentProfile(transaction, id);
        await lockAgentSettings(transaction);
        const [settings, openRunCount, profiles] = await Promise.all([
          transaction.agentGlobalSettings.findUniqueOrThrow({
            where: { id: "global" },
            select: { runtimeEnabled: true },
          }),
          transaction.agentRun.count({
            where: { runStatus: { notIn: [...terminalRunStatuses] } },
          }),
          transaction.agentProfile.findMany({
            where: {
              OR: [
                { user: { username: { in: canonicalUsernames } } },
                { lifecycleStatus: "ACTIVE" },
              ],
            },
            select: {
              id: true,
              user: { select: { username: true } },
              currentPersonaVersion: { select: { persona: true, version: true } },
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
            const canonical = canonicalByUsername.get(profile.user.username);
            return {
              profile,
              canonical,
              assignmentKind: canonical ? "CANONICAL" : "ACTIVE_IMPORTED",
            };
          })
          .sort((left, right) =>
            left.profile.user.username.localeCompare(right.profile.user.username),
          );
        /*
      Kaynaklar ortak bir planla dağıtılır (`planDiverseSourceAssignment`): bir kaynak en fazla
      beş ajana gider; kanonik paket personaları kendi kaynaklarını korur ama sınıra sayılır.
      Plan, uygulama ve son denetim tek SERIALIZABLE işlemde, bütün profil kilitleri altında
      okunan durumla yapılır: bayat plan uygulanamaz, son denetim başarısızsa hiçbir değişiklik
      kalıcılaşmaz (Astra 93a6c17 ve 60d50e1 P2).
    */
        const targetIds = targets.map(({ profile }) => profile.id);
        const planRows = await transaction.agentSource.findMany({
          where: { agentProfileId: { in: targetIds } },
          orderBy: { id: "asc" },
          select: sourceStateSelect,
        });
        // Ajanın engelli kaynakları (yönetici ya da önceki uzlaştırma) plana o ajan için girmez:
        // engel kaldırılmaz, başka kaynak seçilir (Astra 2ff4b2a P2).
        const blockedByProfile = new Map<string, Set<string>>();
        for (const { agentProfileId, url } of planRows.filter((row) => !sourceIsActive(row)))
          blockedByProfile.set(
            agentProfileId,
            new Set([...(blockedByProfile.get(agentProfileId) ?? []), url]),
          );
        // Hedef dışı profillerin (ör. PAUSED/RETIRED ithal) aktif kaynakları çalışma zamanı sınırına
        // sayılır; plan da onları sayar (Astra 93a6c17 P2).
        const externalHolders = await runtimeHolderCounts(transaction, { notIn: targetIds });
        const sourcePlan = planDiverseSourceAssignment(
          targets.map(({ profile, canonical }) => {
            if (!profile.currentPersonaVersion)
              throw new Error(`SOURCE_RECONCILE_PERSONA_MISSING username=${profile.user.username}`);
            return {
              username: profile.user.username,
              persona: seedPersonaSchema.parse(profile.currentPersonaVersion.persona),
              ...(canonical ? { fixedSources: canonical.sources } : {}),
              excludedUrls: blockedByProfile.get(profile.id) ?? new Set<string>(),
            };
          }),
          verifiedPool,
          {
            holderLimit: runtimeSourceHolderLimit,
            externalHolders,
            maxSources: personaSourceLimit,
          },
        );
        /*
      Paket dışı kökenli kaynaklar (ajanın kendi eklediği AGENT, operatör dolgusu vb.) da beş ajan
      sınırına tabi: arkitera'yı tutan 22 ajanın 17'si onu kendisi öğrenmişti. Plan önceliklidir;
      sınırı aşan kaynakta plan dışı kayıtlardan personasıyla en az ilgili olanlar engellenir
      (geçmiş korunur, silinmez). Paket kökenli plan dışı kayıtları aşağıdaki döngü zaten engeller.
    */
        const plannedHolders = new Map<string, Set<string>>();
        for (const { profile } of targets)
          for (const { url } of sourcePlan.get(profile.user.username) ?? [])
            if (!blockedByProfile.get(profile.id)?.has(url))
              plannedHolders.set(
                url,
                new Set([...(plannedHolders.get(url) ?? []), profile.user.username]),
              );
        const personaByProfile = new Map(
          targets.map(({ profile }) => [
            profile.id,
            {
              username: profile.user.username,
              persona: seedPersonaSchema.parse(profile.currentPersonaVersion!.persona),
            },
          ]),
        );
        const outsideHeld = planRows.filter(
          (row) =>
            sourceIsActive(row) &&
            !["INITIAL_PERSONA", "ADMIN_BASELINE_REFRESH"].includes(row.addedByOrigin),
        );
        const rowAffinity = (row: (typeof outsideHeld)[number]) =>
          sourceInterestAffinity(personaByProfile.get(row.agentProfileId)!.persona, {
            url: row.url,
            sourceType: "RSS",
            status: "SEED",
            weight: 0.5,
            pinned: false,
            topics: Array.isArray(row.topics)
              ? row.topics.filter((topic): topic is string => typeof topic === "string")
              : [],
          });
        const excessSourceIds = new Set<string>();
        const heldByUrl = new Map<string, typeof outsideHeld>();
        for (const row of outsideHeld)
          heldByUrl.set(row.url, [...(heldByUrl.get(row.url) ?? []), row]);
        for (const [url, rows] of heldByUrl) {
          const planned = plannedHolders.get(url) ?? new Set<string>();
          const extra = rows
            .filter((row) => !planned.has(personaByProfile.get(row.agentProfileId)!.username))
            .map((row) => ({ row, affinity: rowAffinity(row) }))
            .sort(
              (left, right) =>
                right.affinity - left.affinity || left.row.id.localeCompare(right.row.id),
            );
          const allowed = Math.max(
            0,
            runtimeSourceHolderLimit - planned.size - (externalHolders.get(url) ?? 0),
          );
          for (const { row } of extra.slice(allowed)) excessSourceIds.add(row.id);
        }
        /*
      Ajan başına canlı kaynak stoku (`runtimeAgentSourceLimit`) da korunur: plan dışı kalan
      paket dışı kayıtlar, planın kullanılabilir kaynaklarıyla birlikte sınırı aşıyorsa
      personasıyla en az ilgili olanlar engellenir (Astra 60d50e1 P2).
    */
        for (const { profile } of targets) {
          const planned = new Set(
            (sourcePlan.get(profile.user.username) ?? [])
              .map(({ url }) => url)
              .filter((url) => !blockedByProfile.get(profile.id)?.has(url)),
          );
          const kept = outsideHeld
            .filter(
              (row) =>
                row.agentProfileId === profile.id &&
                !planned.has(row.url) &&
                !excessSourceIds.has(row.id),
            )
            .map((row) => ({ row, affinity: rowAffinity(row) }))
            .sort(
              (left, right) =>
                right.affinity - left.affinity || left.row.id.localeCompare(right.row.id),
            );
          for (const { row } of kept.slice(Math.max(0, runtimeAgentSourceLimit - planned.size)))
            excessSourceIds.add(row.id);
        }
        let personaVersionsCreated = 0;
        let sourcesCreated = 0;
        let sourcesUpdated = 0;
        let sourcesBlocked = 0;

        for (const target of targets) {
          const { assignmentKind, canonical, profile } = target;
          const result = await (async () => {
            const currentPersonaVersion = profile.currentPersonaVersion!;
            const currentPersona = seedPersonaSchema.parse(currentPersonaVersion.persona);
            const sources = sourcePlan.get(profile.user.username);
            if (!sources)
              throw new Error(`SOURCE_RECONCILE_PLAN_MISSING username=${profile.user.username}`);
            // Kanonik paket korunur; ajan için engelli paket kaynakları yüzünden alt sınırın altına
            // düşülüyorsa plan paketi doğrulanmış havuzdan tamamlar.
            const canonicalUrls = new Set(canonical?.sources.map(({ url }) => url) ?? []);
            const targetSourceTopicMappings = canonical
              ? {
                  ...canonical.sourceTopicMappings,
                  ...sourceTopicMappings(sources.filter(({ url }) => !canonicalUrls.has(url))),
                }
              : sourceTopicMappings(sources);
            // jsonb anahtar sırasını değiştirir; düz JSON.stringify aynı içeriği farklı sayıp her
            // çalıştırmada gereksiz persona sürümü oluşturuyordu. Anahtar sırasından bağımsız karşılaştır.
            const personaNeedsUpdate =
              stableJson(currentPersona.sources) !== stableJson(sources) ||
              stableJson(currentPersona.sourceTopicMappings) !==
                stableJson(targetSourceTopicMappings);
            if (personaNeedsUpdate)
              await updateAgent(transaction, { ...actor, requestId: randomUUID() }, profile.id, {
                expectedPersonaVersion: currentPersonaVersion.version,
                persona: {
                  ...currentPersona,
                  sources,
                  sourceTopicMappings: targetSourceTopicMappings,
                },
                changeSummary:
                  assignmentKind === "CANONICAL"
                    ? "Verified and diversified canonical source pack refresh."
                    : "Verified source pool top-up for an active imported writer.",
              });
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
                  adminPinned: reconciledCanonicalAdminPinned(before, source.pinned),
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

            for (const source of existing) {
              if (!excessSourceIds.has(source.id) || source.adminBlocked) continue;
              const stored = await transaction.agentSource.update({
                where: { id: source.id },
                data: { status: "BLOCKED", adminBlocked: true, adminPinned: false },
              });
              blocked += 1;
              await appendRuntimeEvent(transaction, {
                agentProfileId: profile.id,
                eventType: "SOURCE_STATE_CHANGED",
                subject: { type: "SOURCE", id: stored.id },
                safeMessage:
                  "Kaynak çeşitliliği: kaynak beş ajan sınırını aşıyordu; paket dışı kayıt geçmişi korunarak engellendi.",
                before: sourceSnapshot(source),
                after: sourceSnapshot(stored),
                metadata: { origin: "SOURCE_DIVERSITY" },
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
            return {
              created,
              updated,
              blocked,
              personaVersionsCreated: personaNeedsUpdate ? 1 : 0,
            };
          })();
          personaVersionsCreated += result.personaVersionsCreated;
          sourcesCreated += result.created;
          sourcesUpdated += result.updated;
          sourcesBlocked += result.blocked;
        }

        /*
      Son denetim çalışma zamanıyla aynı sayımı kullanır (tüm profiller, engelsiz aktif satırlar).
      Sınırı aşmasına izin verilen tek durum kanonik paketlerin kendisidir: bir kaynağın sahip
      sayısı, onu engelsiz tutan kanonik paket sayısını ve sınırı birlikte aşamaz.
    */
        const finalHolders = await runtimeHolderCounts(transaction);
        const canonicalFixedHolders = new Map<string, number>();
        for (const { profile, canonical } of targets)
          for (const { url } of canonical?.sources ?? [])
            if (!blockedByProfile.get(profile.id)?.has(url))
              canonicalFixedHolders.set(url, (canonicalFixedHolders.get(url) ?? 0) + 1);
        const holderLimitExceptions = [...finalHolders]
          .filter(([, count]) => count > runtimeSourceHolderLimit)
          .map(([url, count]) => ({
            url,
            holders: count,
            canonicalPacks: canonicalFixedHolders.get(url) ?? 0,
          }))
          .sort((left, right) => left.url.localeCompare(right.url));
        const holderLimitViolations = holderLimitExceptions.filter(
          ({ holders, canonicalPacks }) => holders > canonicalPacks,
        );
        // Ajan başına stok sınırı da aynı işlemde denetlenir.
        const stockGroups = await transaction.agentSource.groupBy({
          by: ["agentProfileId"],
          where: {
            agentProfileId: { in: targetIds },
            adminBlocked: false,
            status: { notIn: ["REJECTED", "BLOCKED"] },
          },
          _count: { _all: true },
        });
        const stockViolations = stockGroups
          .filter((group) => group._count._all > runtimeAgentSourceLimit)
          .map((group) => group._count._all);
        const usableCounts = new Map(
          stockGroups.map((group) => [group.agentProfileId, group._count._all]),
        );
        const belowMinimum = targetIds.filter(
          (id) => (usableCounts.get(id) ?? 0) < reconciledSourceMinimum,
        ).length;
        if (holderLimitViolations.length > 0 || stockViolations.length > 0 || belowMinimum > 0)
          throw new ReconcileRejected({
            status: "SOURCE_RECONCILE_LIMIT_VIOLATED_ROLLED_BACK",
            holderLimitViolations,
            stockViolations,
            belowMinimum,
          });
        return {
          targets,
          personaVersionsCreated,
          sourcesCreated,
          sourcesUpdated,
          sourcesBlocked,
          holderLimitExceptions,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 30_000,
        timeout: 900_000,
      },
    );
    const {
      targets,
      personaVersionsCreated,
      sourcesCreated,
      sourcesUpdated,
      sourcesBlocked,
      holderLimitExceptions,
    } = summary;

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
        holderLimitExceptions,
      })}\n`,
    );
  } catch (error) {
    if (!(error instanceof ReconcileRejected)) throw error;
    process.stdout.write(`${JSON.stringify(error.payload)}\n`);
    process.exitCode = 1;
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "SOURCE_RECONCILE_FAILED"}\n`);
  process.exitCode = 1;
});
