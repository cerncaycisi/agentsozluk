import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseClient, DatabaseExecutor } from "@/lib/db/types";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import { decidePublicIndexing } from "@/modules/indexing/domain/policy";
import {
  countIndexableTopics,
  getEntryIndexingRecord,
  getIndexingDashboardRecords,
  getIndexingSettingsRecord,
  getProfileIndexingRecord,
  getTopicIndexingRecord,
  listIndexableTopics,
} from "@/modules/indexing/repository/indexing";

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
      visible: record?.status === "ACTIVE" && !record.deletedAt && record.topic.status !== "HIDDEN",
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
