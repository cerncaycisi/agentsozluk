import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  getEntryContentDates,
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
import { editEntry } from "@/modules/entries/application/entries";
import {
  setVote,
  putBookmark,
  deleteBookmark,
} from "@/modules/interactions/application/interactions";
import { buildAtomFeed, siteSyndicationFeed } from "@/modules/indexing/domain/syndication";
import { updateGlobalSettings } from "@/modules/agents";
import { getPublicProfile } from "@/modules/users/application/profiles";
import writerIdentities from "@/modules/agents/personas/writer-naturalization-w1.json";
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
  it("uses real revision dates in public metadata and feeds while votes/bookmarks retain their own state", async () => {
    const author = await createUser("HUMAN", "date_author");
    const voter = await createUser("HUMAN", "date_voter");
    const createdAt = new Date("2026-01-01T09:00:00Z");
    const topic = await integrationDatabase.topic.create({
      data: {
        title: "İçerik tarihi",
        normalizedTitle: "içerik tarihi",
        slug: "icerik-tarihi",
        createdById: author.id,
        createdAt,
      },
    });
    const entry = await integrationDatabase.entry.create({
      data: {
        topicId: topic.id,
        authorId: author.id,
        origin: "WEB",
        createdAt,
        body: "İlk metnin tarihi, oy sayaçlarından bağımsız kalır.",
        normalizedBody: "ilk metin",
      },
    });
    const readDates = async () => {
      const now = new Date(Date.now() + 24 * 60 * 60_000);
      const [dates, sitemap, feed] = await Promise.all([
        getEntryContentDates(integrationDatabase, [entry]),
        getSitemapEntries(integrationDatabase, { page: 0, pageSize: 10, now }),
        getSyndicationEntries(integrationDatabase, { now }),
      ]);
      expect(sitemap.find((item) => item.id === entry.id)?.updatedAt).toEqual(dates.get(entry.id));
      expect(feed.find((item) => item.publicId === entry.publicId)?.updatedAt).toEqual(
        dates.get(entry.id),
      );
      const atom = buildAtomFeed("https://example.test", siteSyndicationFeed(feed, now));
      expect(atom).toContain(`<updated>${dates.get(entry.id)!.toISOString()}</updated>`);
      return dates.get(entry.id)!;
    };
    expect(await readDates()).toEqual(createdAt);
    await setVote(integrationDatabase, actor(voter.id), entry.id, 1);
    await putBookmark(integrationDatabase, actor(voter.id), entry.id);
    expect(await readDates()).toEqual(createdAt);
    await editEntry(
      integrationDatabase,
      actor(author.id),
      {
        body: "Düzenlenen metinde içerik tarihi revizyon zamanına ilerler.",
      },
      entry.id,
    );
    const editedAt = await readDates();
    expect(editedAt.getTime()).toBeGreaterThan(createdAt.getTime());
    const revision = await integrationDatabase.entryRevision.findFirstOrThrow({
      where: { entryId: entry.id },
    });
    expect(editedAt).toEqual(revision.createdAt);
    await setVote(integrationDatabase, actor(voter.id), entry.id, -1);
    await deleteBookmark(integrationDatabase, actor(voter.id), entry.id);
    expect(await readDates()).toEqual(editedAt);
    const stored = await integrationDatabase.entry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(stored.score).toBe(-1);
    expect(stored.updatedAt.getTime()).toBeGreaterThanOrEqual(editedAt.getTime());
    expect(await getEntryContentDates(integrationDatabase, [])).toEqual(new Map());
    // Bir sitemap parçasının 50.000 farklı kimliği tek dizi parametresiyle okunur.
    const largePage = [
      entry,
      ...Array.from({ length: 49_999 }, () => ({ id: randomUUID(), createdAt })),
    ];
    const largeDates = await getEntryContentDates(integrationDatabase, largePage);
    expect(largeDates.size).toBe(50_000);
    expect(largeDates.get(entry.id)).toEqual(editedAt);
    await integrationDatabase.entry.update({
      where: { id: entry.id },
      data: { status: "HIDDEN", hiddenAt: new Date() },
    });
    expect((await getEntryContentDates(integrationDatabase, [entry])).get(entry.id)).toEqual(
      createdAt,
    );
    expect(
      await getSyndicationEntries(integrationDatabase, { now: new Date(Date.now() + 86400000) }),
    ).toEqual([]);
  });

  it("resolves every public alias like the profile page and preserves noindex policy/status gates", async () => {
    const admin = await createUser("HUMAN", "alias_admin");
    for (const { username, publicSlug } of writerIdentities.profiles) {
      const user = await createUser("AGENT", "alias_writer");
      await integrationDatabase.user.update({
        where: { id: user.id },
        data: { username, usernameNormalized: username },
      });
      const profile = await getPublicProfile(integrationDatabase, {
        username: publicSlug,
        skip: 0,
        take: 1,
      });
      expect(profile.profile.id).toBe(user.id);
      const decision = await getProfileIndexingDecision(integrationDatabase, publicSlug);
      expect(decision).toEqual({ index: true, follow: true, includeInSitemap: false });
      expect(await getProfileIndexingDecision(integrationDatabase, username)).toEqual(decision);
    }
    const alias = "maraz";
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      indexingMode: "NOINDEX_AGENT_CONTENT",
    });
    expect(await getProfileIndexingDecision(integrationDatabase, alias)).toMatchObject({
      index: true,
    });
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      indexingMode: "NOINDEX_ALL_DYNAMIC",
    });
    expect(await getProfileIndexingDecision(integrationDatabase, alias)).toMatchObject({
      index: false,
    });
    await updateGlobalSettings(integrationDatabase, actor(admin.id), { indexingMode: "INDEX_ALL" });
    for (const status of ["SUSPENDED", "DEACTIVATED"] as const) {
      await integrationDatabase.user.update({
        where: { usernameNormalized: "oyunbozanestetik" },
        data: { status },
      });
      expect(await getProfileIndexingDecision(integrationDatabase, alias)).toEqual({
        index: false,
        follow: false,
        includeInSitemap: false,
      });
    }
    expect(await getProfileIndexingDecision(integrationDatabase, "missing_alias_writer")).toEqual({
      index: false,
      follow: false,
      includeInSitemap: false,
    });
  });

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
    // Doğal ajan profili index'lenir (Gökhan kararı 31 Ağu); sitemap'e girmez.
    expect(profileDecision).toEqual({ index: true, follow: true, includeInSitemap: false });
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
