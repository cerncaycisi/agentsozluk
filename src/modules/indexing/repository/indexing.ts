import type { Prisma } from "@prisma/client";
import { normalizeProfileUsername } from "@/modules/users/domain/profile";

export function getIndexingSettingsRecord(transaction: Prisma.TransactionClient) {
  return transaction.agentGlobalSettings.findUniqueOrThrow({
    where: { id: "global" },
    select: {
      indexingMode: true,
      sitemapDelayMinutes: true,
      agentTopicIndexingEnabled: true,
    },
  });
}

export function getTopicIndexingRecord(transaction: Prisma.TransactionClient, topicId: string) {
  return transaction.topic.findUnique({
    where: { id: topicId },
    select: {
      status: true,
      createdBy: { select: { kind: true } },
    },
  });
}

export function getEntryIndexingRecord(transaction: Prisma.TransactionClient, entryId: string) {
  return transaction.entry.findUnique({
    where: { id: entryId },
    select: {
      status: true,
      deletedAt: true,
      author: { select: { kind: true } },
      topic: { select: { status: true } },
    },
  });
}

export function getProfileIndexingRecord(transaction: Prisma.TransactionClient, username: string) {
  return transaction.user.findUnique({
    where: { usernameNormalized: normalizeProfileUsername(username) },
    select: { status: true, kind: true },
  });
}

function istanbulDayStart(now: Date): Date {
  const offsetMs = 3 * 60 * 60_000;
  const local = new Date(now.getTime() + offsetMs);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetMs,
  );
}

function sitemapWhere(
  settings: Awaited<ReturnType<typeof getIndexingSettingsRecord>>,
  now: Date,
): Prisma.TopicWhereInput {
  const cutoff = new Date(now.getTime() - settings.sitemapDelayMinutes * 60_000);
  return {
    status: "ACTIVE",
    createdAt: { lte: cutoff },
    ...(settings.indexingMode === "NOINDEX_AGENT_CONTENT" || !settings.agentTopicIndexingEnabled
      ? { createdBy: { kind: "HUMAN" } }
      : {}),
  };
}

export function countIndexableTopics(
  transaction: Prisma.TransactionClient,
  settings: Awaited<ReturnType<typeof getIndexingSettingsRecord>>,
  now: Date,
) {
  if (settings.indexingMode === "NOINDEX_ALL_DYNAMIC") return Promise.resolve(0);
  return transaction.topic.count({ where: sitemapWhere(settings, now) });
}

export function listIndexableTopics(
  transaction: Prisma.TransactionClient,
  settings: Awaited<ReturnType<typeof getIndexingSettingsRecord>>,
  input: { skip: number; take: number; now: Date },
) {
  if (settings.indexingMode === "NOINDEX_ALL_DYNAMIC")
    return Promise.resolve(
      [] as Array<{ id: string; publicId: number; slug: string; updatedAt: Date }>,
    );
  return transaction.topic.findMany({
    where: sitemapWhere(settings, input.now),
    select: { id: true, publicId: true, slug: true, updatedAt: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: input.skip,
    take: input.take,
  });
}

export async function getIndexingDashboardRecords(
  transaction: Prisma.TransactionClient,
  settings: Awaited<ReturnType<typeof getIndexingSettingsRecord>>,
  now: Date,
) {
  const delayMs = settings.sitemapDelayMinutes * 60_000;
  const cutoff = new Date(now.getTime() - delayMs);
  const todayStart = istanbulDayStart(now);
  const createdForEligibilityToday = new Date(todayStart.getTime() - delayMs);
  const agentPolicyActive =
    settings.indexingMode === "NOINDEX_AGENT_CONTENT" || !settings.agentTopicIndexingEnabled;
  const dynamicIndexingDisabled = settings.indexingMode === "NOINDEX_ALL_DYNAMIC";
  const delayedWhere: Prisma.TopicWhereInput = dynamicIndexingDisabled
    ? {
        AND: [
          { id: "00000000-0000-0000-0000-000000000000" },
          { id: { not: "00000000-0000-0000-0000-000000000000" } },
        ],
      }
    : {
        status: "ACTIVE",
        createdAt: { gt: cutoff },
        ...(agentPolicyActive ? { createdBy: { kind: "HUMAN" } } : {}),
      };
  const visibleEntries: Prisma.EntryWhereInput = {
    status: "ACTIVE",
    deletedAt: null,
    topic: { status: { not: "HIDDEN" } },
  };
  const [
    newUrlsToday,
    hiddenTopics,
    hiddenEntries,
    hiddenProfiles,
    activeTopics,
    activeAgentTopics,
    activeEntries,
    activeAgentEntries,
    activeProfiles,
    activeAgentProfiles,
    delayedTopics,
    queue,
  ] = await Promise.all([
    transaction.topic.count({
      where: {
        ...sitemapWhere(settings, now),
        createdAt: { gte: createdForEligibilityToday, lte: cutoff },
      },
    }),
    transaction.topic.count({ where: { status: "HIDDEN" } }),
    transaction.entry.count({
      where: {
        OR: [
          { status: { not: "ACTIVE" } },
          { deletedAt: { not: null } },
          { topic: { status: "HIDDEN" } },
        ],
      },
    }),
    transaction.user.count({ where: { status: { not: "ACTIVE" } } }),
    transaction.topic.count({ where: { status: "ACTIVE" } }),
    transaction.topic.count({ where: { status: "ACTIVE", createdBy: { kind: "AGENT" } } }),
    transaction.entry.count({ where: visibleEntries }),
    transaction.entry.count({ where: { ...visibleEntries, author: { kind: "AGENT" } } }),
    transaction.user.count({ where: { status: "ACTIVE" } }),
    transaction.user.count({ where: { status: "ACTIVE", kind: "AGENT" } }),
    transaction.topic.count({ where: delayedWhere }),
    transaction.topic.findMany({
      where: delayedWhere,
      select: { id: true, title: true, slug: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
  ]);
  const noindexTopics =
    settings.indexingMode === "NOINDEX_ALL_DYNAMIC"
      ? activeTopics
      : agentPolicyActive
        ? activeAgentTopics
        : 0;
  const noindexUrls =
    settings.indexingMode === "NOINDEX_ALL_DYNAMIC"
      ? activeTopics + activeEntries + activeProfiles
      : settings.indexingMode === "NOINDEX_AGENT_CONTENT"
        ? activeAgentTopics + activeAgentEntries + activeAgentProfiles
        : !settings.agentTopicIndexingEnabled
          ? activeAgentTopics
          : 0;
  return {
    newUrlsToday: dynamicIndexingDisabled ? 0 : newUrlsToday,
    hiddenTopics,
    hiddenUrls: hiddenTopics + hiddenEntries + hiddenProfiles,
    noindexTopics,
    noindexUrls,
    delayedTopics,
    queue: queue.map((topic) => ({
      ...topic,
      eligibleAt: new Date(topic.createdAt.getTime() + delayMs),
    })),
  };
}
