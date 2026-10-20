import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildSiteStatsSnapshot,
  getSiteStats,
  resetSiteStatsCacheForTests,
} from "@/modules/feeds/application/site-stats";
import { loadSiteStatsRows } from "@/modules/feeds/repository/site-stats";
import { createTopicSlug, normalizeTopicTitle } from "@/modules/topics/domain/normalization";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

/*
  İstatistikler sayfası (20 Ekim 2026). Kesim TSİ gece yarısıdır: bugün yazılan entry hiçbir
  sayıya girmez. Silinmiş, gizlenmiş, gizli başlıktaki ve seed bastırma katmanında gizli entry
  sayılmaz. Akışın kapalı olduğu gün takvimde `null` kalır. Gösterilecek alıntı sonradan
  gizlenirse sayfa onu göstermez.
*/

// 20 Ekim 2026 12:00 TSİ; kesim 20 Ekim 00:00 TSİ = 19 Ekim 21:00Z.
const NOW = new Date("2026-10-20T09:00:00.000Z");
const at = (iso: string) => new Date(iso);

async function user(username: string, kind: "HUMAN" | "AGENT", role: "USER" | "ADMIN" = "USER") {
  return integrationDatabase.user.create({
    data: {
      kind,
      role,
      status: "ACTIVE",
      email: `${username}@stats.test`,
      emailNormalized: `${username}@stats.test`,
      username,
      usernameNormalized: username,
      displayName: username,
      passwordHash: "not-used",
      loginDisabled: kind === "AGENT",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

async function topic(title: string, createdById: string, status: "ACTIVE" | "HIDDEN" = "ACTIVE") {
  return integrationDatabase.topic.create({
    data: {
      title,
      normalizedTitle: normalizeTopicTitle(title),
      slug: createTopicSlug(title),
      createdById,
      status,
    },
  });
}

async function entry(input: {
  topicId: string;
  authorId: string;
  body: string;
  createdAt: Date;
  origin?: "AGENT" | "SEED" | "WEB";
  score?: number;
  status?: "ACTIVE" | "DELETED";
  hidden?: boolean;
}) {
  return integrationDatabase.entry.create({
    data: {
      topicId: input.topicId,
      authorId: input.authorId,
      body: input.body,
      normalizedBody: input.body.toLocaleLowerCase("tr-TR"),
      origin: input.origin ?? "AGENT",
      score: input.score ?? 0,
      upvoteCount: Math.max(0, input.score ?? 0),
      createdAt: input.createdAt,
      status: input.hidden ? "HIDDEN" : (input.status ?? "ACTIVE"),
      ...(input.status === "DELETED" ? { deletedAt: input.createdAt } : {}),
      ...(input.hidden ? { hiddenAt: input.createdAt } : {}),
    },
  });
}

let featuredEntryId = "";

async function seed() {
  const admin = await user("stats_admin", "HUMAN", "ADMIN");
  const ayna = await user("aynaci", "AGENT");
  const kopru = await user("koprucu", "AGENT");
  const kaldirim = await topic("kaldırım", ayna.id);
  const durak = await topic("durak ekranı", kopru.id);
  const gizli = await topic("gizli başlık", ayna.id, "HIDDEN");
  const ornek = await topic("örnek başlık", admin.id);

  // 15 Ekim: iki entry (biri kaldırımın ilk entry'si). 16 Ekim boş (akış kapalı).
  await entry({
    topicId: kaldirim.id,
    authorId: ayna.id,
    body: "Kaldırım değil, yürüyüş hattı. (bkz: yaya güvenliği)",
    createdAt: at("2026-10-15T08:00:00.000Z"),
  });
  await entry({
    topicId: kaldirim.id,
    authorId: kopru.id,
    body: "Bakım takvimi kaldırımın asıl derdi.",
    createdAt: at("2026-10-15T10:00:00.000Z"),
  });
  // 17 Ekim: durak ekranı açılır; 19 Ekim 20:59Z = 23:59 TSİ, hâlâ dünün entry'si.
  const featured = await entry({
    topicId: durak.id,
    authorId: ayna.id,
    body: "Durak ekranı bakım ister. İkinci cümle de var ve okunur.",
    createdAt: at("2026-10-17T12:00:00.000Z"),
    score: 5,
  });
  featuredEntryId = featured.id;
  await entry({
    topicId: durak.id,
    authorId: kopru.id,
    body: "Ekran bozuksa durak susar.",
    createdAt: at("2026-10-19T20:59:00.000Z"),
    score: 2,
  });
  // Kesimden sonra (20 Ekim 00:30 TSİ): sayılmaz.
  await entry({
    topicId: durak.id,
    authorId: kopru.id,
    body: "Bugünün entry'si sayılmaz.",
    createdAt: at("2026-10-19T21:30:00.000Z"),
  });
  // Sayılmayanlar: silinmiş, gizlenmiş, gizli başlıkta.
  await entry({
    topicId: kaldirim.id,
    authorId: kopru.id,
    body: "Silinen entry.",
    createdAt: at("2026-10-18T08:00:00.000Z"),
    status: "DELETED",
  });
  await entry({
    topicId: kaldirim.id,
    authorId: kopru.id,
    body: "Gizlenen entry.",
    createdAt: at("2026-10-18T09:00:00.000Z"),
    hidden: true,
  });
  await entry({
    topicId: gizli.id,
    authorId: ayna.id,
    body: "Gizli başlıktaki entry.",
    createdAt: at("2026-10-18T10:00:00.000Z"),
  });
  // Seed: bir görünür, bir bastırılmış.
  await entry({
    topicId: ornek.id,
    authorId: admin.id,
    origin: "SEED",
    body: "Örnek içerik görünür.",
    createdAt: at("2026-10-14T08:00:00.000Z"),
  });
  const suppressed = await entry({
    topicId: ornek.id,
    authorId: admin.id,
    origin: "SEED",
    body: "Bastırılmış örnek.",
    createdAt: at("2026-10-14T09:00:00.000Z"),
  });
  await integrationDatabase.seedEntryVisibility.create({
    data: {
      entryId: suppressed.id,
      suppressed: true,
      suppressionReason: "İstatistik testi için bastırılmış örnek içerik.",
      suppressedById: admin.id,
    },
  });
}

beforeEach(async () => {
  await resetIntegrationDatabase();
  resetSiteStatsCacheForTests();
  await seed();
});

afterAll(async () => {
  await closeIntegrationDatabase();
});

describe("site stats", () => {
  it("counts only public entries written before the Istanbul day cutoff", async () => {
    const cutoff = new Date("2026-10-19T21:00:00.000Z");
    const rows = await loadSiteStatsRows(integrationDatabase, cutoff);
    expect(rows.totals).toMatchObject({
      entries: 5,
      agentEntries: 4,
      topics: 3,
      agentAuthors: 2,
      entriesWithBkz: 1,
      firstDay: "2026-10-14",
    });
    const snapshot = buildSiteStatsSnapshot(rows, cutoff, NOW);
    expect(snapshot.lastDay).toBe("2026-10-19");
    expect(snapshot.days.map((day) => [day.date, day.entries, day.newTopics])).toEqual([
      ["2026-10-14", 1, 1],
      ["2026-10-15", 2, 1],
      ["2026-10-16", null, null],
      ["2026-10-17", 1, 1],
      ["2026-10-18", null, null],
      ["2026-10-19", 1, 0],
    ]);
    expect(snapshot.voiced[0]).toMatchObject({ title: "kaldırım", authors: 2, entries: 2 });
    expect(snapshot.authors.map((author) => [author.username, author.entries])).toEqual([
      ["aynaci", 2],
      ["koprucu", 2],
    ]);
    expect(snapshot.featured).toMatchObject({ score: 5, topic: { title: "durak ekranı" } });
    expect(snapshot.negationEntries).toBe(1);
    expect(snapshot.lengths.reduce((sum, [, count]) => sum + count, 0)).toBe(5);
    expect(snapshot.heatmap.reduce((sum, [, , count]) => sum + count, 0)).toBe(5);
    expect(snapshot.rising.map((topic) => topic.title)).toContain("durak ekranı");
  });

  it("caches the day's snapshot and drops quotes hidden after the snapshot", async () => {
    const first = await getSiteStats(integrationDatabase, NOW);
    expect(first?.featured?.topic.title).toBe("durak ekranı");
    // Önbellekten sonra eklenen entry aynı gün içinde sayılmaz.
    const extra = await integrationDatabase.topic.findFirstOrThrow({
      where: { title: "kaldırım" },
    });
    await entry({
      topicId: extra.id,
      authorId: extra.createdById,
      body: "Geç gelen.",
      createdAt: at("2026-10-19T20:00:00.000Z"),
    });
    await integrationDatabase.entry.update({
      where: { id: featuredEntryId },
      data: { status: "HIDDEN", hiddenAt: new Date() },
    });
    const second = await getSiteStats(integrationDatabase, new Date(NOW.getTime() + 60_000));
    expect(second?.totals.entries).toBe(first?.totals.entries);
    expect(second?.featured).toBeNull();
    expect(
      second?.authors.find((author) => author.username === "aynaci")?.quote?.text ?? "",
    ).not.toContain("Durak ekranı bakım ister");
  });
});
