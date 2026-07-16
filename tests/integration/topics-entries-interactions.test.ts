import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { getDebe, getRandomTopic, getTopicFeed } from "@/modules/feeds/application/feeds";
import { calculateTrendScore } from "@/modules/feeds/domain/trending";
import {
  createEntry,
  deleteEntry,
  editEntry,
  getEntry,
  getTopicEntries,
} from "@/modules/entries/application/entries";
import {
  deleteBookmark,
  getBookmarks,
  putBlock,
  putBookmark,
  putFollow,
  removeVote,
  setVote,
} from "@/modules/interactions/application/interactions";
import { createTopicWithFirstEntry } from "@/modules/topics/application/topics";
import { normalizeTopicTitle } from "@/modules/topics/domain/normalization";
import { searchAll } from "@/modules/search/application/search";
import { getPublicProfile } from "@/modules/users/application/profiles";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

const passwordHash = "integration-test-password-hash";

async function createUser(username: string) {
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "USER",
      status: "ACTIVE",
      email: `${username}@integration.test`,
      emailNormalized: `${username}@integration.test`,
      username,
      usernameNormalized: username,
      displayName: `Test ${username}`,
      passwordHash,
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

function actor(userId: string): ActorContext {
  return {
    actorId: userId,
    actorKind: "HUMAN",
    actorRole: "USER",
    requestId: randomUUID(),
    origin: "API",
  };
}

async function createTopic(userId: string, title = "Gerçek PostgreSQL başlığı") {
  return createTopicWithFirstEntry(integrationDatabase, actor(userId), {
    title,
    entryBody: "İlk entry transaction içinde oluşturulan yeterince uzun bir metindir.",
  });
}

beforeEach(async () => {
  await resetIntegrationDatabase();
});

afterAll(async () => {
  await closeIntegrationDatabase();
});

describe("topics and entries with PostgreSQL", () => {
  it("creates a topic and first entry atomically and rejects normalized duplicates", async () => {
    const writer = await createUser("writer_one");
    const created = await createTopic(writer.id, "  İyi   Bir\nBaşlık  ");

    expect(created.topic.title).toBe("İyi Bir Başlık");
    expect(created.topic.normalizedTitle).toBe("iyi bir başlık");
    expect(created.topic.entryCount).toBe(1);
    expect(created.entry.body).toContain("transaction içinde");
    await expect(createTopic(writer.id, "iyi bir başlık")).rejects.toMatchObject({
      code: "TOPIC_EXISTS",
      status: 409,
      details: {
        canonicalTopic: {
          id: created.topic.id,
          title: created.topic.title,
          url: created.topic.url,
        },
      },
    });
    expect(await integrationDatabase.topic.count()).toBe(1);
    expect(await integrationDatabase.entry.count()).toBe(1);
  });

  it("prevents a topic title that conflicts with an alias", async () => {
    const writer = await createUser("writer_two");
    const created = await createTopic(writer.id);
    await integrationDatabase.topicAlias.create({
      data: {
        topicId: created.topic.id,
        title: "Eski Başlık",
        normalizedTitle: normalizeTopicTitle("Eski Başlık"),
        slug: "eski-baslik",
      },
    });

    await expect(createTopic(writer.id, "ESKİ BAŞLIK")).rejects.toMatchObject({
      code: "TOPIC_EXISTS",
      status: 409,
    });
  });

  it("serializes a duplicate topic race with the advisory lock", async () => {
    const firstWriter = await createUser("race_writer_one");
    const secondWriter = await createUser("race_writer_two");
    const results = await Promise.allSettled([
      createTopic(firstWriter.id, "Yarış Koşulu Başlığı"),
      createTopic(secondWriter.id, "yarış koşulu başlığı"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: { code: "TOPIC_EXISTS", status: 409 },
    });
    expect(await integrationDatabase.topic.count()).toBe(1);
    expect(await integrationDatabase.entry.count()).toBe(1);
  });

  it("creates, revises, leaves unchanged and soft-deletes an entry with exact counters", async () => {
    const writer = await createUser("writer_three");
    const created = await createTopic(writer.id);
    const second = await createEntry(integrationDatabase, actor(writer.id), created.topic.id, {
      body: "Düzenlenecek ikinci entry için yeterince uzun başlangıç metni.",
    });
    expect(
      (await integrationDatabase.topic.findUniqueOrThrow({ where: { id: created.topic.id } }))
        .entryCount,
    ).toBe(2);

    const updated = await editEntry(
      integrationDatabase,
      actor(writer.id),
      { body: "Düzenlenmiş ikinci entry ve doğrulanmış yeni içerik metni." },
      second.id,
    );
    expect(updated.body).toContain("Düzenlenmiş");
    expect(await integrationDatabase.entryRevision.count({ where: { entryId: second.id } })).toBe(
      1,
    );

    await editEntry(
      integrationDatabase,
      actor(writer.id),
      { body: "Düzenlenmiş ikinci entry ve doğrulanmış yeni içerik metni." },
      second.id,
    );
    expect(await integrationDatabase.entryRevision.count({ where: { entryId: second.id } })).toBe(
      1,
    );

    const deleted = await deleteEntry(integrationDatabase, actor(writer.id), second.id);
    expect(deleted.status).toBe("DELETED");
    expect(deleted.body).toContain("Düzenlenmiş");
    expect(
      (await integrationDatabase.topic.findUniqueOrThrow({ where: { id: created.topic.id } }))
        .entryCount,
    ).toBe(1);
    expect(await integrationDatabase.entry.count({ where: { id: second.id } })).toBe(1);
    expect(
      await integrationDatabase.outboxEvent.count({ where: { eventType: "entry.deleted" } }),
    ).toBe(1);
    await expect(getEntry(integrationDatabase, second.id, null)).resolves.toMatchObject({
      body: "bu entry yazar tarafından silindi",
      status: "DELETED",
    });
    await expect(
      getEntry(integrationDatabase, second.id, {
        userId: writer.id,
        role: "USER",
        status: "ACTIVE",
      }),
    ).resolves.toMatchObject({ body: deleted.body, status: "DELETED" });
  });
});

describe("interactions with PostgreSQL", () => {
  it("creates, repeats, changes and removes a vote atomically", async () => {
    const author = await createUser("vote_author");
    const voter = await createUser("vote_voter");
    const created = await createTopic(author.id);

    expect(await setVote(integrationDatabase, actor(voter.id), created.entry.id, 1)).toMatchObject({
      value: 1,
      score: 1,
      upvoteCount: 1,
      downvoteCount: 0,
    });
    expect(await setVote(integrationDatabase, actor(voter.id), created.entry.id, 1)).toMatchObject({
      value: 1,
      score: 1,
    });
    expect(await setVote(integrationDatabase, actor(voter.id), created.entry.id, -1)).toMatchObject(
      {
        value: -1,
        score: -1,
        upvoteCount: 0,
        downvoteCount: 1,
      },
    );
    expect(await removeVote(integrationDatabase, actor(voter.id), created.entry.id)).toMatchObject({
      value: null,
      score: 0,
      upvoteCount: 0,
      downvoteCount: 0,
    });
    expect(
      await integrationDatabase.outboxEvent.count({ where: { eventType: "entry.voted" } }),
    ).toBe(3);
  });

  it("rejects voting on an own entry", async () => {
    const author = await createUser("own_vote_author");
    const created = await createTopic(author.id);
    await expect(
      setVote(integrationDatabase, actor(author.id), created.entry.id, 1),
    ).rejects.toMatchObject({
      code: "CANNOT_VOTE_OWN_ENTRY",
      status: 403,
    });
  });

  it("rejects writes on hidden content and returns the target for merged follows", async () => {
    const author = await createUser("state_author");
    const viewer = await createUser("state_viewer");
    const source = await createTopic(author.id, "Birleştirilecek Başlık");
    const target = await createTopic(author.id, "Hedef Başlık");
    await integrationDatabase.entry.update({
      where: { id: source.entry.id },
      data: { status: "HIDDEN", hiddenAt: new Date() },
    });
    await expect(
      setVote(integrationDatabase, actor(viewer.id), source.entry.id, 1),
    ).rejects.toMatchObject({ code: "ENTRY_NOT_EDITABLE", status: 409 });
    await expect(
      putBookmark(integrationDatabase, actor(viewer.id), source.entry.id),
    ).rejects.toMatchObject({ code: "ENTRY_NOT_EDITABLE", status: 409 });

    await integrationDatabase.topic.update({
      where: { id: source.topic.id },
      data: { status: "HIDDEN" },
    });
    await expect(
      createEntry(integrationDatabase, actor(viewer.id), source.topic.id, {
        body: "Gizlenmiş başlığa yazılmaması gereken yeterince uzun entry.",
      }),
    ).rejects.toMatchObject({ code: "TOPIC_HIDDEN", status: 409 });

    await integrationDatabase.topic.update({
      where: { id: source.topic.id },
      data: { status: "MERGED", mergedIntoId: target.topic.id },
    });
    await expect(
      createEntry(integrationDatabase, actor(viewer.id), source.topic.id, {
        body: "Birleştirilmiş başlığa yazılmaması gereken yeterince uzun entry.",
      }),
    ).rejects.toMatchObject({ code: "TOPIC_MERGED", status: 409 });
    await expect(
      putFollow(integrationDatabase, actor(viewer.id), source.topic.id),
    ).resolves.toMatchObject({
      followed: false,
      canonicalTopic: { id: target.topic.id },
    });
  });

  it("keeps bookmark, follow and block writes idempotent and exposes block collapse data", async () => {
    const author = await createUser("blocked_author");
    const viewer = await createUser("block_viewer");
    const created = await createTopic(author.id);

    await putBookmark(integrationDatabase, actor(viewer.id), created.entry.id);
    await putBookmark(integrationDatabase, actor(viewer.id), created.entry.id);
    expect(await integrationDatabase.entryBookmark.count()).toBe(1);
    await integrationDatabase.entry.update({
      where: { id: created.entry.id },
      data: { status: "HIDDEN", hiddenAt: new Date() },
    });
    expect((await getBookmarks(integrationDatabase, viewer.id, 0, 20))[0]).toHaveLength(0);
    await integrationDatabase.entry.update({
      where: { id: created.entry.id },
      data: { status: "ACTIVE", hiddenAt: null },
    });
    await deleteBookmark(integrationDatabase, actor(viewer.id), created.entry.id);
    await deleteBookmark(integrationDatabase, actor(viewer.id), created.entry.id);
    expect(await integrationDatabase.entryBookmark.count()).toBe(0);

    await putFollow(integrationDatabase, actor(viewer.id), created.topic.id);
    await putFollow(integrationDatabase, actor(viewer.id), created.topic.id);
    expect(await integrationDatabase.topicFollow.count()).toBe(1);

    await putBlock(integrationDatabase, actor(viewer.id), author.id);
    await putBlock(integrationDatabase, actor(viewer.id), author.id);
    expect(await integrationDatabase.userBlock.count()).toBe(1);
    await expect(putBlock(integrationDatabase, actor(viewer.id), viewer.id)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 422,
    });
    const result = await getTopicEntries(integrationDatabase, {
      topicId: created.topic.id,
      viewer: { userId: viewer.id, role: "USER", status: "ACTIVE" },
      page: 1,
      pageSize: 20,
      skip: 0,
      sort: "oldest",
    });
    expect(result.entries[0]).toMatchObject({
      id: created.entry.id,
      blockedByViewer: true,
    });
  });
});

describe("search, feeds and profiles with PostgreSQL", () => {
  it("searches topics, aliases, users and active entries with stable result contracts", async () => {
    const writer = await createUser("acikkaynakci");
    await integrationDatabase.user.update({
      where: { id: writer.id },
      data: { displayName: "İstanbul Açık Kaynak Topluluğu" },
    });
    const created = await createTopic(writer.id, "Açık Kaynak Kültürü");
    await integrationDatabase.topicAlias.create({
      data: {
        topicId: created.topic.id,
        title: "Özgür Yazılım",
        normalizedTitle: normalizeTopicTitle("Özgür Yazılım"),
        slug: "ozgur-yazilim",
      },
    });
    await integrationDatabase.entry.update({
      where: { id: created.entry.id },
      data: {
        body: "Güvenli veri arama için benzersiz bir PostgreSQL entry içeriği.",
        normalizedBody: "güvenli veri arama için benzersiz bir postgresql entry içeriği.",
      },
    });

    const topicResults = await searchAll(integrationDatabase, {
      query: "AÇIK KAYNAK",
      type: "topics",
      page: 1,
      pageSize: 20,
      skip: 0,
    });
    expect(topicResults.results[0]).toMatchObject({ type: "topic", id: created.topic.id });
    expect(
      (
        await searchAll(integrationDatabase, {
          query: "özgür yazılım",
          type: "topics",
          page: 1,
          pageSize: 20,
          skip: 0,
        })
      ).results[0],
    ).toMatchObject({ type: "topic", id: created.topic.id });
    expect(
      (
        await searchAll(integrationDatabase, {
          query: "istanbul açık",
          type: "users",
          page: 1,
          pageSize: 20,
          skip: 0,
        })
      ).results[0],
    ).toMatchObject({ type: "user", id: writer.id });
    const entryResults = await searchAll(integrationDatabase, {
      query: "benzersiz postgresql",
      type: "entries",
      page: 1,
      pageSize: 20,
      skip: 0,
    });
    expect(entryResults.results[0]).toMatchObject({ type: "entry", id: created.entry.id });
    expect(entryResults.results[0]?.snippet.length).toBeLessThanOrEqual(180);

    await integrationDatabase.entry.update({
      where: { id: created.entry.id },
      data: { status: "HIDDEN", hiddenAt: new Date() },
    });
    expect(
      (
        await searchAll(integrationDatabase, {
          query: "benzersiz postgresql",
          type: "entries",
          page: 1,
          pageSize: 20,
          skip: 0,
        })
      ).results,
    ).toHaveLength(0);
  });

  it("calculates rolling and Istanbul-day feeds, DEBE and randomKey selection", async () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const author = await createUser("feed_author");
    const secondAuthor = await createUser("feed_second");
    const voter = await createUser("feed_voter");
    const first = await createTopic(author.id, "Akış Formülü Başlığı");
    const secondEntry = await createEntry(
      integrationDatabase,
      actor(secondAuthor.id),
      first.topic.id,
      {
        body: "Akış formülünde ikinci yazarı temsil eden yeterince uzun entry.",
      },
    );
    const previousDayEntryAt = new Date("2026-07-15T20:00:00.000Z");
    const todayEntryAt = new Date("2026-07-16T10:00:00.000Z");
    await integrationDatabase.entry.update({
      where: { id: first.entry.id },
      data: {
        createdAt: previousDayEntryAt,
        score: 1,
        upvoteCount: 1,
      },
    });
    await integrationDatabase.entry.update({
      where: { id: secondEntry.id },
      data: {
        createdAt: todayEntryAt,
        score: 1,
        upvoteCount: 1,
      },
    });
    await integrationDatabase.topic.update({
      where: { id: first.topic.id },
      data: { lastEntryAt: todayEntryAt },
    });
    await integrationDatabase.entryVote.createMany({
      data: [
        {
          entryId: first.entry.id,
          userId: voter.id,
          value: 1,
          createdAt: previousDayEntryAt,
          updatedAt: previousDayEntryAt,
        },
        {
          entryId: secondEntry.id,
          userId: voter.id,
          value: 1,
          createdAt: todayEntryAt,
          updatedAt: todayEntryAt,
        },
      ],
    });

    const trending = await getTopicFeed(integrationDatabase, {
      feed: "trending",
      page: 1,
      pageSize: 30,
      skip: 0,
      now,
    });
    const trendTopic = trending.topics.find((topic) => topic.id === first.topic.id);
    expect(trendTopic).toMatchObject({
      activeEntryCount: 2,
      uniqueAuthorCount: 2,
      positiveVotes: 2,
      negativeVotes: 0,
    });
    expect(trendTopic?.trendScore).toBe(
      calculateTrendScore({
        activeEntryCount: 2,
        uniqueAuthorCount: 2,
        positiveVotes: 2,
        negativeVotes: 0,
        hoursSinceLastActiveEntry: 2,
      }),
    );
    const popular = await getTopicFeed(integrationDatabase, {
      feed: "popular",
      page: 1,
      pageSize: 30,
      skip: 0,
      now,
    });
    expect(popular.topics.find((topic) => topic.id === first.topic.id)).toMatchObject({
      activeEntryCount: 1,
      positiveVotes: 1,
    });
    expect((await getDebe(integrationDatabase, now)).map((entry) => entry.id)).toEqual([
      first.entry.id,
    ]);

    const second = await createTopic(author.id, "Rastgele İkinci Başlık");
    await integrationDatabase.topic.update({
      where: { id: first.topic.id },
      data: { randomKey: 0.2 },
    });
    await integrationDatabase.topic.update({
      where: { id: second.topic.id },
      data: { randomKey: 0.8 },
    });
    await expect(getRandomTopic(integrationDatabase, 0.5)).resolves.toMatchObject({
      id: second.topic.id,
    });
    await integrationDatabase.topic.update({
      where: { id: second.topic.id },
      data: { status: "HIDDEN" },
    });
    await expect(getRandomTopic(integrationDatabase, 0.5)).resolves.toMatchObject({
      id: first.topic.id,
    });

    await integrationDatabase.topic.update({
      where: { id: first.topic.id },
      data: { createdAt: new Date("2026-07-14T10:00:00.000Z"), lastEntryAt: todayEntryAt },
    });
    await integrationDatabase.topic.update({
      where: { id: second.topic.id },
      data: { status: "ACTIVE", createdAt: now, lastEntryAt: previousDayEntryAt },
    });
    const recent = await getTopicFeed(integrationDatabase, {
      feed: "recent",
      page: 1,
      pageSize: 30,
      skip: 0,
      now,
    });
    expect(recent.topics.slice(0, 2).map((topic) => topic.id)).toEqual([
      first.topic.id,
      second.topic.id,
    ]);
    const newest = await getTopicFeed(integrationDatabase, {
      feed: "new",
      page: 1,
      pageSize: 30,
      skip: 0,
      now,
    });
    expect(newest.topics[0]?.id).toBe(second.topic.id);

    await integrationDatabase.topic.createMany({
      data: Array.from({ length: 31 }, (_, index) => ({
        title: `Akış sınırı ${index}`,
        normalizedTitle: `akış sınırı ${index}`,
        slug: `akis-siniri-${index}`,
        createdById: author.id,
      })),
    });
    const capped = await getTopicFeed(integrationDatabase, {
      feed: "new",
      page: 1,
      pageSize: 50,
      skip: 0,
      now,
    });
    expect(capped.topics).toHaveLength(30);
    expect(capped.totalItems).toBe(30);
  });

  it("returns paginated public profiles without private email fields", async () => {
    const writer = await createUser("profile_writer");
    const created = await createTopic(writer.id, "Profil Başlığı");
    await createEntry(integrationDatabase, actor(writer.id), created.topic.id, {
      body: "Profil sayfalamasında ikinci sırada duran yeterince uzun entry.",
    });
    await integrationDatabase.user.update({
      where: { id: writer.id },
      data: { status: "SUSPENDED", bio: "Güvenli ve herkese açık profil açıklaması." },
    });

    const result = await getPublicProfile(integrationDatabase, {
      username: "PROFILE_WRITER",
      skip: 0,
      take: 1,
    });
    expect(result.profile).toMatchObject({
      id: writer.id,
      status: "SUSPENDED",
      activeEntryCount: 2,
      openedActiveTopicCount: 1,
    });
    expect(Object.keys(result.profile)).not.toContain("email");
    expect(result.entries).toHaveLength(1);
    expect(result.totalItems).toBe(2);

    await integrationDatabase.user.update({
      where: { id: writer.id },
      data: {
        username: `deleted_${writer.id.replaceAll("-", "").slice(0, 12)}`,
        usernameNormalized: `deleted_${writer.id.replaceAll("-", "").slice(0, 12)}`,
        displayName: "silinmiş hesap",
        bio: null,
        status: "DEACTIVATED",
        deactivatedAt: new Date(),
      },
    });
    const anonymous = await getPublicProfile(integrationDatabase, {
      username: `deleted_${writer.id.replaceAll("-", "").slice(0, 12)}`,
      skip: 0,
      take: 20,
    });
    expect(anonymous.profile).toMatchObject({
      displayName: "silinmiş hesap",
      bio: null,
      status: "DEACTIVATED",
    });
    expect(anonymous.entries).toHaveLength(2);
  });
});
