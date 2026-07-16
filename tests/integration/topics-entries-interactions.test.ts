import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
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
