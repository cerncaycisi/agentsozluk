import type { DatabaseClient } from "@/lib/db/types";
import { describe, expect, it } from "vitest";
import { getEntry } from "@/modules/entries/application/entries";

const authorId = "018f5d51-8f89-7a4e-89df-2166b53ea41f";
const canonicalTopicId = "018f5d51-8f89-7a4e-89df-2166b53ea420";
const canonicalTopic = {
  id: canonicalTopicId,
  publicId: 420,
  title: "Kanonik başlık",
  slug: "kanonik-baslik",
};

function databaseReturning(status: "HIDDEN" | "DELETED"): DatabaseClient {
  const entry = {
    id: "018f5d51-8f89-7a4e-89df-2166b53ea421",
    publicId: 421,
    topicId: "018f5d51-8f89-7a4e-89df-2166b53ea422",
    authorId,
    body: "yalnız yetkili kişinin görebileceği entry içeriği",
    normalizedBody: "yalnız yetkili kişinin görebileceği entry içeriği",
    status,
    score: 0,
    upvoteCount: 0,
    downvoteCount: 0,
    origin: "WEB",
    createdAt: new Date("2026-07-17T10:00:00.000Z"),
    updatedAt: new Date("2026-07-17T10:00:00.000Z"),
    deletedAt: status === "DELETED" ? new Date("2026-07-17T11:00:00.000Z") : null,
    hiddenAt: status === "HIDDEN" ? new Date("2026-07-17T11:00:00.000Z") : null,
    topic: {
      id: "018f5d51-8f89-7a4e-89df-2166b53ea422",
      publicId: 422,
      title: "Birleştirilmiş başlık",
      slug: "birlestirilmis-baslik",
      status: "MERGED",
      mergedIntoId: canonicalTopicId,
      mergedInto: canonicalTopic,
      createdById: authorId,
    },
    author: {
      id: authorId,
      username: "entry_author",
      displayName: "Entry Author",
      status: "ACTIVE",
    },
    _count: { revisions: 0 },
  };
  const transaction = { entry: { findUnique: async () => entry } };
  return {
    $transaction: async (work: (value: typeof transaction) => Promise<unknown>) =>
      work(transaction),
  } as unknown as DatabaseClient;
}

describe("merged-topic entry visibility", () => {
  it("does not expose a hidden entry body to a visitor", async () => {
    await expect(getEntry(databaseReturning("HIDDEN"), "entry-id", null)).rejects.toMatchObject({
      code: "ENTRY_NOT_FOUND",
      status: 404,
    });
  });

  it("redacts a deleted body before attaching the canonical topic marker", async () => {
    await expect(getEntry(databaseReturning("DELETED"), "entry-id", null)).resolves.toMatchObject({
      body: "bu entry yazar tarafından silindi",
      normalizedBody: "",
      canonicalTopicId,
      canonicalTopic,
    });
  });

  it("lets the author inspect the hidden body and canonical destination", async () => {
    await expect(
      getEntry(databaseReturning("HIDDEN"), "entry-id", {
        userId: authorId,
        role: "USER",
        status: "ACTIVE",
      }),
    ).resolves.toMatchObject({
      body: "yalnız yetkili kişinin görebileceği entry içeriği",
      canonicalTopicId,
      canonicalTopic,
    });
  });
});
