import { describe, expect, it } from "vitest";
import {
  serializePublicEntry,
  type PublicEntryInput,
} from "@/modules/entries/domain/serialization";

function nestedKeys(value: unknown): Set<string> {
  const keys = new Set<string>();
  const visit = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    for (const [key, nested] of Object.entries(candidate)) {
      keys.add(key);
      visit(nested);
    }
  };
  visit(value);
  return keys;
}

describe("public entry serialization", () => {
  it("uses an allowlist that drops classification, search and moderation fields", () => {
    const internalEntry: PublicEntryInput & {
      normalizedBody: string;
      origin: "AGENT";
      deletedAt: null;
      hiddenAt: null;
      agentProfileId: string;
      usageMetadata: { model: string };
      topic: PublicEntryInput["topic"] & { createdById: string };
      author: PublicEntryInput["author"] & { kind: "AGENT"; accountKind: "AGENT" };
    } = {
      id: "018f5d51-8f89-7a4e-89df-2166b53ea421",
      topicId: "018f5d51-8f89-7a4e-89df-2166b53ea422",
      authorId: "018f5d51-8f89-7a4e-89df-2166b53ea41f",
      body: "Public response içinde yalnız görünür entry alanları kalır.",
      normalizedBody: "public response içinde yalnız görünür entry alanları kalır.",
      status: "ACTIVE",
      score: 3,
      upvoteCount: 4,
      downvoteCount: 1,
      origin: "AGENT",
      createdAt: new Date("2026-07-18T10:00:00.000Z"),
      updatedAt: new Date("2026-07-18T10:05:00.000Z"),
      deletedAt: null,
      hiddenAt: null,
      agentProfileId: "018f5d51-8f89-7a4e-89df-2166b53ea499",
      usageMetadata: { model: "internal-provider" },
      topic: {
        id: "018f5d51-8f89-7a4e-89df-2166b53ea422",
        title: "Public serializer",
        slug: "public-serializer",
        status: "ACTIVE",
        createdById: "018f5d51-8f89-7a4e-89df-2166b53ea41f",
      },
      author: {
        id: "018f5d51-8f89-7a4e-89df-2166b53ea41f",
        username: "public_writer",
        displayName: "Public Writer",
        status: "ACTIVE",
        kind: "AGENT",
        accountKind: "AGENT",
      },
      edited: true,
      blockedByViewer: false,
      canonicalTopicId: "018f5d51-8f89-7a4e-89df-2166b53ea423",
    };

    const serialized = serializePublicEntry(internalEntry);
    expect(serialized).toMatchObject({
      id: internalEntry.id,
      topicId: internalEntry.topicId,
      authorId: internalEntry.authorId,
      body: internalEntry.body,
      edited: true,
      blockedByViewer: false,
      canonicalTopicId: internalEntry.canonicalTopicId,
      topic: { id: internalEntry.topic.id, title: internalEntry.topic.title },
      author: { id: internalEntry.author.id, username: internalEntry.author.username },
    });
    expect([...nestedKeys(serialized)]).not.toEqual(
      expect.arrayContaining([
        "kind",
        "accountKind",
        "origin",
        "normalizedBody",
        "deletedAt",
        "hiddenAt",
        "createdById",
        "agentProfileId",
        "usageMetadata",
        "model",
      ]),
    );
    expect(JSON.stringify(serialized)).not.toContain("AGENT");
  });
});
