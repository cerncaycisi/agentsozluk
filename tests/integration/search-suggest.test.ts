import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { searchAll } from "@/modules/search/application/search";
import { searchSuggestions } from "@/modules/search/application/suggest";
import { createTopicWithFirstEntry } from "@/modules/topics";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

async function createUser(username: string, status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED") {
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "USER",
      status,
      email: `${username}@integration.test`,
      emailNormalized: `${username}@integration.test`,
      username,
      usernameNormalized: username,
      displayName: username.replaceAll("_", " "),
      passwordHash: "not-used",
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

function createTopic(userId: string, title: string) {
  return createTopicWithFirstEntry(integrationDatabase, actor(userId), {
    title,
    entryBody: "Öneri uç noktası için oluşturulan yeterince uzun bir ilk entry metnidir.",
  });
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("search suggestion API with PostgreSQL", () => {
  it("returns an empty payload below two characters instead of an error", async () => {
    const writer = await createUser("oneri_yazari", "ACTIVE");
    await createTopic(writer.id, "öneri başlığı bir");

    await expect(searchSuggestions(integrationDatabase, { query: "ö" })).resolves.toEqual({
      topics: [],
      users: [],
    });
    await expect(searchSuggestions(integrationDatabase, { query: "  " })).resolves.toEqual({
      topics: [],
      users: [],
    });
    await expect(searchSuggestions(integrationDatabase, { query: "" })).resolves.toEqual({
      topics: [],
      users: [],
    });
  });

  it("suggests both topics and authors with the documented contract", async () => {
    const writer = await createUser("onerici", "ACTIVE");
    const created = await createTopic(writer.id, "önerilen açık kaynak başlığı");

    const suggestions = await searchSuggestions(integrationDatabase, { query: "  ÖNERİ  " });

    expect(suggestions.topics).toContainEqual({
      title: "önerilen açık kaynak başlığı",
      url: created.topic.url,
    });
    expect(suggestions.users).toContainEqual({ username: "onerici", url: "/yazar/onerici" });
    expect(suggestions.topics.map((topic) => Object.keys(topic).sort())).toEqual(
      suggestions.topics.map(() => ["title", "url"]),
    );
    expect(suggestions.users.map((user) => Object.keys(user).sort())).toEqual(
      suggestions.users.map(() => ["url", "username"]),
    );
    expect(JSON.stringify(suggestions)).not.toMatch(/"snippet"|"rank"|"id"|"kind"|"email"/u);
  });

  it("caps topics and authors at eight items each", async () => {
    const writer = await createUser("kapasite_yazari", "ACTIVE");
    for (let index = 0; index < 11; index += 1) {
      await createTopic(writer.id, `kapasite denemesi başlığı ${index}`);
    }
    for (let index = 0; index < 11; index += 1) {
      await createUser(`kapasite_uye_${index}`, "ACTIVE");
    }

    const suggestions = await searchSuggestions(integrationDatabase, { query: "kapasite" });

    expect(suggestions.topics).toHaveLength(8);
    expect(suggestions.users).toHaveLength(8);
  });

  it("never suggests hidden or merged topics", async () => {
    const writer = await createUser("gizli_yazar", "ACTIVE");
    await createTopic(writer.id, "gizlilik denemesi görünür başlık");
    const hidden = await createTopic(writer.id, "gizlilik denemesi gizli başlık");
    const merged = await createTopic(writer.id, "gizlilik denemesi birleşmiş başlık");
    await integrationDatabase.topic.update({
      where: { id: hidden.topic.id },
      data: { status: "HIDDEN" },
    });
    await integrationDatabase.topic.update({
      where: { id: merged.topic.id },
      data: { status: "MERGED" },
    });

    const suggestions = await searchSuggestions(integrationDatabase, {
      query: "gizlilik denemesi",
    });
    const titles = suggestions.topics.map((topic) => topic.title);

    expect(titles).toContain("gizlilik denemesi görünür başlık");
    expect(titles).not.toContain("gizlilik denemesi gizli başlık");
    expect(titles).not.toContain("gizlilik denemesi birleşmiş başlık");
  });

  it("never suggests suspended or deactivated authors even though search still lists suspended ones", async () => {
    await createUser("durum_aktif", "ACTIVE");
    await createUser("durum_askida", "SUSPENDED");
    await createUser("durum_kapali", "DEACTIVATED");

    const suggestions = await searchSuggestions(integrationDatabase, { query: "durum_" });
    const suggested = suggestions.users.map((user) => user.username);

    expect(suggested).toContain("durum_aktif");
    expect(suggested).not.toContain("durum_askida");
    expect(suggested).not.toContain("durum_kapali");

    // `/ara` davranışı değişmedi: askıya alınmış hesabın profili hâlâ erişilebilir
    // olduğu için normal aramada listelenmeye devam eder, yalnız öneri modu daraltır.
    const searched = await searchAll(integrationDatabase, {
      query: "durum_",
      type: "users",
      page: 1,
      pageSize: 20,
      skip: 0,
    });
    const searchedUrls = searched.results.map((row) => row.url);
    expect(searchedUrls).toContain("/yazar/durum_askida");
    expect(searchedUrls).not.toContain("/yazar/durum_kapali");
  });

  it("treats wildcard characters literally and truncates over-long queries", async () => {
    const writer = await createUser("kacis_yazari", "ACTIVE");
    const slash = String.fromCharCode(92);
    const literal = `kacis%_${slash}denemesi`;
    await createTopic(writer.id, `Yalnızca ${literal} içeren başlık`);
    await createTopic(writer.id, "kacis alakasiz baska baslik");

    const literalSuggestions = await searchSuggestions(integrationDatabase, { query: literal });
    // `%` ve `_` joker değil, harfi harfine aranıyor: tam eşleşen başlık ilk sırada.
    // Listede ikinci bir başlık da olabilir — sorgu pg_trgm benzerlik operatörünü
    // (`%`) de kullanıyor ve "kacis" trigramlarını paylaşan başlıklar bulanık
    // eşleşmeyle geliyor. `/ara` da aynısını döndürür; daraltan tek şey kaçış değil.
    expect(literalSuggestions.topics[0]?.title).toBe(`Yalnızca ${literal} içeren başlık`);

    // Asıl joker kontrolü: tek başına `%` her şeyi getirmemeli.
    const wildcardOnly = await searchSuggestions(integrationDatabase, { query: "%%" });
    expect(wildcardOnly.topics).toHaveLength(0);

    await expect(
      searchSuggestions(integrationDatabase, { query: "k".repeat(140) }),
    ).resolves.toEqual({ topics: [], users: [] });
  });
});
