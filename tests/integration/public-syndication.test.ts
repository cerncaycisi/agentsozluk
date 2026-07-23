import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getAtom } from "@/app/atom.xml/route";
import { GET as getTopicAtom } from "@/app/baslik/[topic]/atom.xml/route";
import { GET as getTopicRss } from "@/app/baslik/[topic]/feed.xml/route";
import { GET as getRss } from "@/app/feed.xml/route";
import { GET as getProfileAtom } from "@/app/yazar/[username]/atom.xml/route";
import { GET as getProfileRss } from "@/app/yazar/[username]/feed.xml/route";
import { updateGlobalSettings } from "@/modules/agents";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("public syndication routes with PostgreSQL", () => {
  it("serves policy-aware global/topic/profile feeds and canonical scoped redirects", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const user = await integrationDatabase.user.create({
      data: {
        kind: "HUMAN",
        role: "ADMIN",
        status: "ACTIVE",
        email: `feed_${suffix}@example.test`,
        emailNormalized: `feed_${suffix}@example.test`,
        username: `feed_${suffix}`,
        usernameNormalized: `feed_${suffix}`,
        displayName: "Feed & Yazar",
        passwordHash: "not-used",
        termsVersion: "1.0",
        termsAcceptedAt: new Date(),
      },
    });
    const actor: ActorContext = {
      actorId: user.id,
      actorKind: "HUMAN",
      actorRole: "ADMIN",
      requestId: randomUUID(),
      origin: "API",
    };
    await updateGlobalSettings(integrationDatabase, actor, { sitemapDelayMinutes: 0 });
    const topic = await integrationDatabase.topic.create({
      data: {
        title: "Feed & keşif",
        normalizedTitle: "feed & keşif",
        slug: "feed-kesif",
        createdById: user.id,
      },
    });
    const entry = await integrationDatabase.entry.create({
      data: {
        topicId: topic.id,
        authorId: user.id,
        body: "Public <feed> & canonical entry.",
        normalizedBody: "public <feed> & canonical entry.",
        origin: "WEB",
      },
    });
    const hiddenTopic = await integrationDatabase.topic.create({
      data: {
        title: "Hidden feed topic",
        normalizedTitle: "hidden feed topic",
        slug: "hidden-feed-topic",
        createdById: user.id,
        status: "HIDDEN",
      },
    });
    const hiddenEntry = await integrationDatabase.entry.create({
      data: {
        topicId: hiddenTopic.id,
        authorId: user.id,
        body: "Hidden feed body must never be syndicated.",
        normalizedBody: "hidden feed body must never be syndicated.",
        origin: "WEB",
      },
    });

    const [rss, atom, topicRss, topicAtom, profileRss, profileAtom] = await Promise.all([
      getRss(),
      getAtom(),
      getTopicRss(new Request("http://localhost"), {
        params: Promise.resolve({ topic: `${topic.slug}--${topic.publicId}` }),
      }),
      getTopicAtom(new Request("http://localhost"), {
        params: Promise.resolve({ topic: `${topic.slug}--${topic.publicId}` }),
      }),
      getProfileRss(new Request("http://localhost"), {
        params: Promise.resolve({ username: user.username }),
      }),
      getProfileAtom(new Request("http://localhost"), {
        params: Promise.resolve({ username: user.username }),
      }),
    ]);

    expect(rss.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8");
    expect(atom.headers.get("Content-Type")).toBe("application/atom+xml; charset=utf-8");
    for (const response of [rss, atom, topicRss, topicAtom, profileRss, profileAtom]) {
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain(`http://localhost:3000/entry/${entry.publicId}`);
      expect(body).not.toContain(`http://localhost:3000/entry/${hiddenEntry.publicId}`);
      expect(body).not.toContain("Hidden feed body");
      expect(body).not.toContain("<feed>");
    }

    const legacyTopicFeed = await getTopicRss(new Request("http://localhost"), {
      params: Promise.resolve({ topic: topic.id }),
    });
    expect(legacyTopicFeed.status).toBe(308);
    expect(legacyTopicFeed.headers.get("Location")).toBe(
      `http://localhost:3000/baslik/${topic.slug}--${topic.publicId}/feed.xml`,
    );
    const normalizedProfileFeed = await getProfileAtom(new Request("http://localhost"), {
      params: Promise.resolve({ username: user.username.toUpperCase() }),
    });
    expect(normalizedProfileFeed.status).toBe(308);
    expect(normalizedProfileFeed.headers.get("Location")).toBe(
      `http://localhost:3000/yazar/${user.username}/atom.xml`,
    );

    await updateGlobalSettings(integrationDatabase, actor, {
      indexingMode: "NOINDEX_ALL_DYNAMIC",
    });
    const disabledFeed = await getRss();
    expect(await disabledFeed.text()).not.toContain("<item>");
  });
});
