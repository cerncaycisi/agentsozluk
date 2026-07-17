import type { DatabaseClient } from "@/lib/db/types";
import { describe, expect, it, vi } from "vitest";
import { getEntryRevisions } from "@/modules/entries/application/entries";

const authorId = "018f5d51-8f89-7a4e-89df-2166b53ea41f";
const entryId = "018f5d51-8f89-7a4e-89df-2166b53ea420";

const entry = {
  id: entryId,
  topicId: "018f5d51-8f89-7a4e-89df-2166b53ea421",
  authorId,
  body: "revision geçmişi olan yeterince uzun entry içeriği",
  normalizedBody: "revision geçmişi olan yeterince uzun entry içeriği",
  status: "ACTIVE",
  score: 0,
  upvoteCount: 0,
  downvoteCount: 0,
  origin: "WEB",
  createdAt: new Date("2026-07-17T09:00:00.000Z"),
  updatedAt: new Date("2026-07-17T11:00:00.000Z"),
  deletedAt: null,
  hiddenAt: null,
  topic: {
    id: "018f5d51-8f89-7a4e-89df-2166b53ea421",
    title: "Revision başlığı",
    slug: "revision-basligi",
    status: "ACTIVE",
    mergedIntoId: null,
    createdById: authorId,
  },
  author: {
    id: authorId,
    username: "revision_author",
    displayName: "Revision Author",
    status: "ACTIVE",
  },
  _count: { revisions: 3 },
};

function revisionDatabase(foundEntry: typeof entry | null) {
  const revisions = [
    {
      id: "018f5d51-8f89-7a4e-89df-2166b53ea422",
      body: "entry içeriğinin bir önceki sürümü",
      createdAt: new Date("2026-07-17T10:00:00.000Z"),
      editedBy: { id: authorId, username: "revision_author", displayName: "Revision Author" },
    },
  ];
  const findMany = vi.fn().mockResolvedValue(revisions);
  const count = vi.fn().mockResolvedValue(3);
  const transaction = {
    entry: { findUnique: vi.fn().mockResolvedValue(foundEntry) },
    entryRevision: { findMany, count },
  };
  const database = {
    $transaction: async (work: (value: typeof transaction) => Promise<unknown>) =>
      work(transaction),
  } as unknown as DatabaseClient;
  return { database, findMany, count, revisions };
}

describe("entry revision access", () => {
  it("returns the author's paginated revision history newest-first", async () => {
    const { database, findMany, count, revisions } = revisionDatabase(entry);
    await expect(
      getEntryRevisions(
        database,
        entryId,
        { userId: authorId, role: "USER", status: "ACTIVE" },
        { skip: 20, take: 10 },
      ),
    ).resolves.toEqual({ revisions, totalItems: 3 });

    expect(findMany).toHaveBeenCalledWith({
      where: { entryId },
      select: {
        id: true,
        body: true,
        createdAt: true,
        editedBy: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 20,
      take: 10,
    });
    expect(count).toHaveBeenCalledWith({ where: { entryId } });
  });

  it("allows an active moderator to inspect another author's history", async () => {
    const { database } = revisionDatabase(entry);
    await expect(
      getEntryRevisions(
        database,
        entryId,
        {
          userId: "018f5d51-8f89-7a4e-89df-2166b53ea423",
          role: "MODERATOR",
          status: "ACTIVE",
        },
        { skip: 0, take: 20 },
      ),
    ).resolves.toMatchObject({ totalItems: 3 });
  });

  it("rejects an unrelated user before loading revision bodies", async () => {
    const { database, findMany, count } = revisionDatabase(entry);
    await expect(
      getEntryRevisions(
        database,
        entryId,
        {
          userId: "018f5d51-8f89-7a4e-89df-2166b53ea424",
          role: "USER",
          status: "ACTIVE",
        },
        { skip: 0, take: 20 },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it("returns 404 without querying revisions when the entry is absent", async () => {
    const { database, findMany, count } = revisionDatabase(null);
    await expect(
      getEntryRevisions(
        database,
        entryId,
        { userId: authorId, role: "USER", status: "ACTIVE" },
        { skip: 0, take: 20 },
      ),
    ).rejects.toMatchObject({ code: "ENTRY_NOT_FOUND", status: 404 });
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });
});
