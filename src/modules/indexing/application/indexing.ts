import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseClient, DatabaseExecutor, TransactionClient } from "@/lib/db/types";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import { decidePublicIndexing } from "@/modules/indexing/domain/policy";
import {
  countIndexableEntries,
  countIndexableTopics,
  getEntryIndexingRecord,
  getIndexingDashboardRecords,
  getIndexingSettingsRecord,
  getProfileIndexingRecord,
  getTopicIndexingRecord,
  listEntryContentRevisions,
  listIndexableEntries,
  listIndexableTopics,
  listSyndicationEntries,
} from "@/modules/indexing/repository/indexing";

type EntryContentIdentity = { id: string; createdAt: Date };

async function entryContentDates(
  transaction: TransactionClient,
  entries: readonly EntryContentIdentity[],
): Promise<Map<string, Date>> {
  const dates = new Map(entries.map((entry) => [entry.id, entry.createdAt]));
  if (dates.size === 0) return dates;
  const revisions = await listEntryContentRevisions(transaction, [...dates.keys()]);
  for (const revision of revisions) {
    const changedAt = revision.createdAt;
    const createdAt = dates.get(revision.entryId)!;
    if (changedAt && changedAt > createdAt) dates.set(revision.entryId, changedAt);
  }
  return dates;
}

// Yalnız public metadata okuyucuları kullanır; ortak entry DTO'su ve runtime
// snapshot'ındaki updatedAt sözleşmesi değiştirilmez.
export function getEntryContentDates(
  client: DatabaseClient,
  entries: readonly EntryContentIdentity[],
) {
  return client.$transaction((transaction) => entryContentDates(transaction, entries));
}

export function getTopicIndexingDecision(client: DatabaseClient, topicId: string) {
  return inTransaction(client, async (transaction) => {
    const [settings, record] = await Promise.all([
      getIndexingSettingsRecord(transaction),
      getTopicIndexingRecord(transaction, topicId),
    ]);
    return decidePublicIndexing({
      mode: settings.indexingMode,
      target: "TOPIC",
      isAgentContent: record?.createdBy.kind === "AGENT",
      agentTopicIndexingEnabled: settings.agentTopicIndexingEnabled,
      visible: record?.status === "ACTIVE",
    });
  });
}

export function getEntryIndexingDecision(client: DatabaseClient, entryId: string) {
  return client.$transaction(async (transaction) => {
    const [settings, record] = await Promise.all([
      getIndexingSettingsRecord(transaction),
      getEntryIndexingRecord(transaction, entryId),
    ]);
    return decidePublicIndexing({
      mode: settings.indexingMode,
      target: "ENTRY",
      isAgentContent: record?.author.kind === "AGENT",
      agentTopicIndexingEnabled: settings.agentTopicIndexingEnabled,
      visible: record?.status === "ACTIVE" && !record.deletedAt && record.topic.status === "ACTIVE",
    });
  });
}

export function getProfileIndexingDecision(client: DatabaseClient, username: string) {
  return client.$transaction(async (transaction) => {
    const [settings, record] = await Promise.all([
      getIndexingSettingsRecord(transaction),
      getProfileIndexingRecord(transaction, username),
    ]);
    return decidePublicIndexing({
      mode: settings.indexingMode,
      target: "PROFILE",
      isAgentContent: record?.kind === "AGENT",
      agentTopicIndexingEnabled: settings.agentTopicIndexingEnabled,
      visible: record?.status === "ACTIVE",
    });
  });
}

export function getSitemapTopicCount(client: DatabaseClient, now = new Date()) {
  return client.$transaction(async (transaction) => {
    const settings = await getIndexingSettingsRecord(transaction);
    return countIndexableTopics(transaction, settings, now);
  });
}

export function getSitemapTopics(
  client: DatabaseClient,
  input: { page: number; pageSize: number; now?: Date },
) {
  return client.$transaction(async (transaction) => {
    const settings = await getIndexingSettingsRecord(transaction);
    return listIndexableTopics(transaction, settings, {
      skip: input.page * input.pageSize,
      take: input.pageSize,
      now: input.now ?? new Date(),
    });
  });
}

export function getSitemapEntryCount(client: DatabaseClient, now = new Date()) {
  return client.$transaction(async (transaction) => {
    const settings = await getIndexingSettingsRecord(transaction);
    return countIndexableEntries(transaction, settings, now);
  });
}

export function getSitemapEntries(
  client: DatabaseClient,
  input: { page: number; pageSize: number; now?: Date },
) {
  return client.$transaction(async (transaction) => {
    const settings = await getIndexingSettingsRecord(transaction);
    const entries = await listIndexableEntries(transaction, settings, {
      skip: input.page * input.pageSize,
      take: input.pageSize,
      now: input.now ?? new Date(),
    });
    const dates = await entryContentDates(transaction, entries);
    return entries.map((entry) => ({ ...entry, updatedAt: dates.get(entry.id)! }));
  });
}

export function getSyndicationEntries(
  client: DatabaseClient,
  input: {
    limit?: number;
    now?: Date;
    topicId?: string;
    authorId?: string;
  } = {},
) {
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new RangeError("SYNDICATION_LIMIT_INVALID");
  return client.$transaction(async (transaction) => {
    const settings = await getIndexingSettingsRecord(transaction);
    const entries = await listSyndicationEntries(transaction, settings, {
      take: limit,
      now: input.now ?? new Date(),
      ...(input.topicId ? { topicId: input.topicId } : {}),
      ...(input.authorId ? { authorId: input.authorId } : {}),
    });
    const dates = await entryContentDates(transaction, entries);
    return entries.map((entry) => ({ ...entry, updatedAt: dates.get(entry.id)! }));
  });
}

export function getIndexingDashboard(
  client: DatabaseExecutor,
  actor: ActorContext,
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const settings = await getIndexingSettingsRecord(transaction);
    return { settings, ...(await getIndexingDashboardRecords(transaction, settings, now)) };
  });
}
