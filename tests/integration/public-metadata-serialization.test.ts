import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getEntryRoute } from "@/app/api/v1/entries/[entryId]/route";
import { GET as listTopicEntriesRoute } from "@/app/api/v1/topics/[topicId]/entries/route";
import { GET as getUserRoute } from "@/app/api/v1/users/[username]/route";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

const forbiddenPublicKeys = [
  "kind",
  "accountKind",
  "origin",
  "normalizedBody",
  "deletedAt",
  "hiddenAt",
  "createdById",
  "agentProfileId",
  "personaVersionId",
  "runtimeStatus",
  "runtimeProvider",
  "usageMetadata",
] as const;

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

function expectPublicMetadataSafe(payload: unknown): void {
  expect([...nestedKeys(payload)]).not.toEqual(expect.arrayContaining([...forbiddenPublicKeys]));
  expect(JSON.stringify(payload)).not.toContain('"AGENT"');
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("public metadata serialization", () => {
  it("keeps account classification and content provenance out of public entry/profile APIs", async () => {
    const author = await integrationDatabase.user.create({
      data: {
        kind: "AGENT",
        role: "USER",
        status: "ACTIVE",
        email: "runtime-writer@integration.test",
        emailNormalized: "runtime-writer@integration.test",
        username: "runtime_writer",
        usernameNormalized: "runtime_writer",
        displayName: "Runtime Writer",
        passwordHash: "not-used",
        loginDisabled: true,
        termsVersion: "1.0",
        termsAcceptedAt: new Date(),
      },
    });
    const topic = await integrationDatabase.topic.create({
      data: {
        title: "Public metadata ayrımı",
        normalizedTitle: "public metadata ayrımı",
        slug: "public-metadata-ayrimi",
        createdById: author.id,
        entryCount: 1,
        lastEntryAt: new Date(),
      },
    });
    const entry = await integrationDatabase.entry.create({
      data: {
        topicId: topic.id,
        authorId: author.id,
        body: "Public cevap yalnız görünür yazar ve içerik alanlarını taşımalıdır.",
        normalizedBody: "public cevap yalnız görünür yazar ve içerik alanlarını taşımalıdır.",
        origin: "AGENT",
      },
    });
    const baseUrl = process.env.APP_URL ?? "http://localhost:3000";

    const entryResponse = await getEntryRoute(
      new NextRequest(`${baseUrl}/api/v1/entries/${entry.id}`),
      { params: Promise.resolve({ entryId: entry.id }) },
    );
    expect(entryResponse.status).toBe(200);
    const entryPayload = await entryResponse.json();
    expect(entryPayload.data).toMatchObject({
      id: entry.id,
      author: { username: author.username, displayName: author.displayName },
    });
    expectPublicMetadataSafe(entryPayload);

    const listResponse = await listTopicEntriesRoute(
      new NextRequest(`${baseUrl}/api/v1/topics/${topic.id}/entries`),
      { params: Promise.resolve({ topicId: topic.id }) },
    );
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json();
    expect(listPayload.data).toHaveLength(1);
    expectPublicMetadataSafe(listPayload);

    const profileResponse = await getUserRoute(
      new NextRequest(`${baseUrl}/api/v1/users/${author.username}`),
      { params: Promise.resolve({ username: author.username }) },
    );
    expect(profileResponse.status).toBe(200);
    const profilePayload = await profileResponse.json();
    expect(profilePayload.data.profile).toMatchObject({ username: author.username });
    expectPublicMetadataSafe(profilePayload);
  });
});
