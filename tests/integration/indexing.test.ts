import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  getEntryIndexingDecision,
  getIndexingDashboard,
  getProfileIndexingDecision,
  getSitemapEntries,
  getSitemapEntryCount,
  getSitemapTopicCount,
  getSitemapTopics,
  getSyndicationEntries,
  getTopicIndexingDecision,
} from "@/modules/indexing";
import { updateGlobalSettings } from "@/modules/agents";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

async function createUser(kind: "HUMAN" | "AGENT", name: string) {
  const suffix = randomUUID().replaceAll("-", "");
  const username = `${name}_${suffix.slice(0, 12)}`;
  return integrationDatabase.user.create({
    data: {
      kind,
      role: kind === "HUMAN" ? "ADMIN" : "USER",
      status: "ACTIVE",
      email: `${username}@indexing.test`,
      emailNormalized: `${username}@indexing.test`,
      username,
      usernameNormalized: username,
      displayName: `${name} indexing`,
      passwordHash: "not-used",
      loginDisabled: kind === "AGENT",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

function actor(adminId: string): ActorContext {
  return {
    actorId: adminId,
    actorKind: "HUMAN",
    actorRole: "ADMIN",
    requestId: randomUUID(),
    origin: "API",
  };
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("indexing policy with PostgreSQL", () => {
  it("applies delay, visibility and internal account facts without public metadata", async () => {
    const now = new Date("2026-07-18T12:00:00.000Z");
    const human = await createUser("HUMAN", "human");
    const agent = await createUser("AGENT", "agent");
    const createTopic = (
      createdById: string,
      title: string,
      createdAt: Date,
      status: "ACTIVE" | "HIDDEN" = "ACTIVE",
    ) =>
      integrationDatabase.topic.create({
        data: {
          title,
          normalizedTitle: title.toLocaleLowerCase("tr-TR"),
          slug: title.toLocaleLowerCase("tr-TR").replaceAll(" ", "-"),
          createdById,
          createdAt,
          status,
        },
      });
    const oldHuman = await createTopic(
      human.id,
      "Old human indexing topic",
      new Date(now.getTime() - 7 * 60 * 60_000),
    );
    const recentHuman = await createTopic(
      human.id,
      "Recent human indexing topic",
      new Date(now.getTime() - 60 * 60_000),
    );
    const oldAgent = await createTopic(
      agent.id,
      "Old agent indexing topic",
      new Date(now.getTime() - 7 * 60 * 60_000),
    );
    const hiddenTopic = await createTopic(
      human.id,
      "Hidden indexing topic",
      new Date(now.getTime() - 7 * 60 * 60_000),
      "HIDDEN",
    );
    const agentEntry = await integrationDatabase.entry.create({
      data: {
        topicId: oldHuman.id,
        authorId: agent.id,
        body: "Indexing kararında internal account fact kullanan agent entry içeriği.",
        normalizedBody: "indexing kararında internal account fact kullanan agent entry içeriği.",
        origin: "AGENT",
        createdAt: new Date(now.getTime() - 7 * 60 * 60_000),
      },
    });
    const humanEntry = await integrationDatabase.entry.create({
      data: {
        topicId: oldHuman.id,
        authorId: human.id,
        body: "Indexlenebilir insan entry içeriği.",
        normalizedBody: "indexlenebilir insan entry içeriği.",
        origin: "WEB",
        createdAt: new Date(now.getTime() - 7 * 60 * 60_000),
      },
    });
    const hiddenTopicEntry = await integrationDatabase.entry.create({
      data: {
        topicId: hiddenTopic.id,
        authorId: human.id,
        body: "Hidden topic içindeki active entry public indexing kararı alamaz.",
        normalizedBody: "hidden topic içindeki active entry public indexing kararı alamaz.",
        origin: "WEB",
        createdAt: new Date(now.getTime() - 7 * 60 * 60_000),
      },
    });

    expect(await getSitemapTopicCount(integrationDatabase, now)).toBe(2);
    expect(await getSitemapEntryCount(integrationDatabase, now)).toBe(2);
    expect(
      (await getSitemapEntries(integrationDatabase, { page: 0, pageSize: 10, now })).map(
        ({ id }) => id,
      ),
    ).toEqual(expect.arrayContaining([agentEntry.id, humanEntry.id]));
    expect(
      (await getSitemapTopics(integrationDatabase, { page: 0, pageSize: 10, now })).map(
        ({ id }) => id,
      ),
    ).toEqual(expect.arrayContaining([oldHuman.id, oldAgent.id]));
    expect(
      (await getSyndicationEntries(integrationDatabase, { now })).map(({ publicId }) => publicId),
    ).toEqual(expect.arrayContaining([agentEntry.publicId, humanEntry.publicId]));
    expect(
      (
        await getSyndicationEntries(integrationDatabase, {
          now,
          topicId: oldHuman.id,
        })
      ).map(({ publicId }) => publicId),
    ).toEqual(expect.arrayContaining([agentEntry.publicId, humanEntry.publicId]));
    expect(
      (
        await getSyndicationEntries(integrationDatabase, {
          now,
          authorId: agent.id,
        })
      ).map(({ publicId }) => publicId),
    ).toEqual([agentEntry.publicId]);
    expect(
      (await getSyndicationEntries(integrationDatabase, { now })).map(({ publicId }) => publicId),
    ).not.toContain(hiddenTopicEntry.publicId);
    const dashboard = await getIndexingDashboard(integrationDatabase, actor(human.id), now);
    expect(dashboard).toMatchObject({ hiddenTopics: 1, hiddenUrls: 2, delayedTopics: 1 });
    expect(dashboard.queue.map(({ id }) => id)).toContain(recentHuman.id);

    await updateGlobalSettings(integrationDatabase, actor(human.id), {
      indexingMode: "NOINDEX_AGENT_CONTENT",
      sitemapDelayMinutes: 0,
    });
    expect(await getSitemapTopicCount(integrationDatabase, now)).toBe(2);
    expect(await getSitemapEntryCount(integrationDatabase, now)).toBe(1);
    expect(
      (await getSitemapEntries(integrationDatabase, { page: 0, pageSize: 10, now })).map(
        ({ id }) => id,
      ),
    ).toEqual([humanEntry.id]);
    expect(
      (await getSyndicationEntries(integrationDatabase, { now })).map(({ publicId }) => publicId),
    ).toEqual([humanEntry.publicId]);
    expect(await getTopicIndexingDecision(integrationDatabase, oldAgent.id)).toEqual({
      index: false,
      follow: false,
      includeInSitemap: false,
    });
    expect(await getTopicIndexingDecision(integrationDatabase, oldHuman.id)).toMatchObject({
      index: true,
    });
    expect(await getEntryIndexingDecision(integrationDatabase, agentEntry.id)).toMatchObject({
      index: false,
    });
    expect(await getEntryIndexingDecision(integrationDatabase, hiddenTopicEntry.id)).toMatchObject({
      index: false,
    });
    const profileDecision = await getProfileIndexingDecision(integrationDatabase, agent.username);
    expect(profileDecision).toEqual({ index: false, follow: false, includeInSitemap: false });
    expect(JSON.stringify(profileDecision)).not.toMatch(/agent|kind|origin/iu);
    expect(
      await getProfileIndexingDecision(integrationDatabase, human.username.toUpperCase()),
    ).toMatchObject({ index: true });
    expect(await getIndexingDashboard(integrationDatabase, actor(human.id), now)).toMatchObject({
      noindexTopics: 1,
      noindexUrls: 3,
    });

    await updateGlobalSettings(integrationDatabase, actor(human.id), {
      indexingMode: "INDEX_ALL",
      agentTopicIndexingEnabled: false,
      sitemapDelayMinutes: 10_080,
    });
    expect(await getSitemapTopicCount(integrationDatabase, now)).toBe(0);
    expect(await getSitemapEntryCount(integrationDatabase, now)).toBe(0);
    await updateGlobalSettings(integrationDatabase, actor(human.id), {
      indexingMode: "NOINDEX_ALL_DYNAMIC",
      agentTopicIndexingEnabled: true,
      sitemapDelayMinutes: 0,
    });
    await integrationDatabase.topic.create({
      data: {
        id: "00000000-0000-0000-0000-000000000000",
        title: "Zero UUID noindex sentinel regression",
        normalizedTitle: "zero uuid noindex sentinel regression",
        slug: "zero-uuid-noindex-sentinel-regression",
        createdById: human.id,
        createdAt: new Date(now.getTime() - 60 * 60_000),
      },
    });
    expect(await getSitemapTopicCount(integrationDatabase, now)).toBe(0);
    expect(await getSitemapEntryCount(integrationDatabase, now)).toBe(0);
    expect(await getSitemapTopics(integrationDatabase, { page: 0, pageSize: 10, now })).toEqual([]);
    expect(await getSitemapEntries(integrationDatabase, { page: 0, pageSize: 10, now })).toEqual(
      [],
    );
    expect(await getSyndicationEntries(integrationDatabase, { now })).toEqual([]);
    expect(await getIndexingDashboard(integrationDatabase, actor(human.id), now)).toMatchObject({
      newUrlsToday: 0,
      delayedTopics: 0,
      queue: [],
    });
  });

  it("counts today's sitemap additions on the Europe/Istanbul date boundary", async () => {
    const admin = await createUser("HUMAN", "timezone");
    const now = new Date("2026-07-18T22:00:00.000Z");
    await updateGlobalSettings(integrationDatabase, actor(admin.id), { sitemapDelayMinutes: 360 });
    const createTopicAt = (title: string, createdAt: Date) =>
      integrationDatabase.topic.create({
        data: {
          title,
          normalizedTitle: title.toLocaleLowerCase("tr-TR"),
          slug: title.toLocaleLowerCase("tr-TR").replaceAll(" ", "-"),
          createdById: admin.id,
          createdAt,
        },
      });
    await createTopicAt("Eligible previous Istanbul day", new Date("2026-07-18T14:30:00.000Z"));
    await createTopicAt("Eligible current Istanbul day", new Date("2026-07-18T15:30:00.000Z"));

    expect(await getIndexingDashboard(integrationDatabase, actor(admin.id), now)).toMatchObject({
      newUrlsToday: 1,
    });
  });
});
