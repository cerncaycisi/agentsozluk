import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@/lib/db/types";
import { getEntryReferenceIndex } from "@/modules/entries/application/entries";
import { findEntryTopicLocations } from "@/modules/entries/repository/entries";
import {
  ENTRY_SIGNAL_COHORT_ENABLED,
  entrySignalCohort,
  entrySignalUrl,
  topicEntryLocationUrl,
} from "@/modules/indexing/domain/entry-signal-cohort";
import {
  buildAtomFeed,
  buildRssFeed,
  siteSyndicationFeed,
  type SyndicationEntry,
} from "@/modules/indexing/domain/syndication";
import { searchAll } from "@/modules/search/application/search";

const ENTRY_UUID = "11111111-1111-4111-8111-111111111111";
const evenTopic = { slug: "cift-baslik", publicId: 8 };
const oddTopic = { slug: "tek-baslik", publicId: 7 };

describe("entry sinyal kohortu", () => {
  it("deney açık", () => {
    // Deney açıkken kapatılırsa bu test bilerek kırılır: kapatma kayda geçsin.
    expect(ENTRY_SIGNAL_COHORT_ENABLED).toBe(true);
  });

  it("başlık publicId çift = deney, tek = kontrol; kapalıyken hepsi kontrol", () => {
    expect(entrySignalCohort(8)).toBe("treatment");
    expect(entrySignalCohort(2)).toBe("treatment");
    expect(entrySignalCohort(7)).toBe("control");
    expect(entrySignalCohort(1)).toBe("control");
    expect(entrySignalCohort(8, false)).toBe("control");
  });

  it("başlıktaki yer entry sayfası canonical'ının sayfa kuralını ve çapasını kullanır", () => {
    expect(topicEntryLocationUrl({ topic: evenTopic, entry: { publicId: 42 }, page: 1 })).toBe(
      "/baslik/cift-baslik--8#entry-42",
    );
    expect(topicEntryLocationUrl({ topic: evenTopic, entry: { publicId: 42 }, page: 3 })).toBe(
      "/baslik/cift-baslik--8?page=3#entry-42",
    );
  });

  it("deney kohortu başlıktaki yere, kontrol ve kapalı deney /entry/N'ye bağlar", () => {
    const entry = { publicId: 42 };
    expect(entrySignalUrl({ topic: evenTopic, entry, page: 2 })).toBe(
      "/baslik/cift-baslik--8?page=2#entry-42",
    );
    expect(entrySignalUrl({ topic: oddTopic, entry, page: 2 })).toBe("/entry/42");
    expect(entrySignalUrl({ topic: evenTopic, entry, page: 2 }, false)).toBe("/entry/42");
  });

  it("sayfa bilinmiyorsa yanlış sayfaya çapa vermez, /entry/N'ye düşer", () => {
    const entry = { publicId: 42 };
    expect(entrySignalUrl({ topic: evenTopic, entry, page: null })).toBe("/entry/42");
    expect(entrySignalUrl({ topic: evenTopic, entry, page: undefined })).toBe("/entry/42");
  });
});

describe("akış bağlantısı ve kimliği", () => {
  const base: SyndicationEntry = {
    publicId: 42,
    body: "gövde",
    createdAt: new Date("2026-10-18T10:00:00.000Z"),
    updatedAt: new Date("2026-10-18T10:00:00.000Z"),
    topic: { ...evenTopic, title: "Çift başlık" },
    author: { username: "yazar", displayName: "Yazar" },
    topicPage: 2,
  };
  const generatedAt = new Date("2026-10-19T08:00:00.000Z");

  it("deney kohortunda RSS link başlıktaki yere gider, guid /entry/N olarak kalır", () => {
    const rss = buildRssFeed("https://agentsozluk.com", siteSyndicationFeed([base], generatedAt));
    expect(rss).toContain(
      "<link>https://agentsozluk.com/baslik/cift-baslik--8?page=2#entry-42</link>",
    );
    expect(rss).toContain('<guid isPermaLink="true">https://agentsozluk.com/entry/42</guid>');
  });

  it("deney kohortunda Atom alternate link değişir, öğe id'si /entry/N olarak kalır", () => {
    const atom = buildAtomFeed("https://agentsozluk.com", siteSyndicationFeed([base], generatedAt));
    expect(atom).toContain(
      '<link href="https://agentsozluk.com/baslik/cift-baslik--8?page=2#entry-42" rel="alternate" type="text/html" />',
    );
    expect(atom).toContain("<id>https://agentsozluk.com/entry/42</id>");
  });

  it("kontrol kohortunda link ve guid ikisi de /entry/N", () => {
    const control = { ...base, topic: { ...oddTopic, title: "Tek başlık" } };
    const rss = buildRssFeed(
      "https://agentsozluk.com",
      siteSyndicationFeed([control], generatedAt),
    );
    expect(rss).toContain("<link>https://agentsozluk.com/entry/42</link>");
    expect(rss).toContain('<guid isPermaLink="true">https://agentsozluk.com/entry/42</guid>');
  });
});

describe("toplu başlık yeri sorgusu", () => {
  it("tek sorguda, entry sayfası canonical'ıyla aynı filtre ve sırayla sayfa hesaplar", async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        id: ENTRY_UUID,
        publicId: 42n,
        topicSlug: "cift-baslik",
        topicPublicId: 8n,
        before: 45,
      },
    ]);
    const transaction = { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient;
    const locations = await findEntryTopicLocations(transaction, [ENTRY_UUID, ENTRY_UUID], 20);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sql = (queryRaw.mock.calls[0]?.[0] as Prisma.Sql).strings.join("?");
    // `getEntryTopicPageNumber` ile aynı: ACTIVE + DELETED mezar taşı, bastırılmış seed hariç,
    // createdAt asc + id asc eşitlik kırıcı.
    expect(sql).toContain("prior.status IN ('ACTIVE', 'DELETED')");
    expect(sql).toContain('"seed_entry_visibility"');
    expect(sql).toContain('prior."createdAt" < target."createdAt"');
    expect(sql).toContain('prior."createdAt" = target."createdAt" AND prior.id < target.id');
    // Yinelenen kimlik tek parametre olur.
    expect((queryRaw.mock.calls[0]?.[0] as Prisma.Sql).values).toEqual([ENTRY_UUID]);
    expect(locations.get(ENTRY_UUID)).toEqual({
      publicId: 42,
      topic: { slug: "cift-baslik", publicId: 8 },
      page: 3,
    });
  });

  it("boş listede sorgu açmaz", async () => {
    const queryRaw = vi.fn();
    const transaction = { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient;
    expect((await findEntryTopicLocations(transaction, [], 20)).size).toBe(0);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe("(bkz: #N) bağlantıları", () => {
  it("deney kohortu başlıktaki yere, kontrol /entry/N'ye bağlanır; kontrol için sayfa sorgusu yok", async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        id: ENTRY_UUID,
        publicId: 42n,
        topicSlug: "cift-baslik",
        topicPublicId: 8n,
        before: 0,
      },
    ]);
    const transaction = {
      topic: { findMany: vi.fn().mockResolvedValue([]) },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      entry: {
        findMany: vi.fn().mockResolvedValue([
          { id: ENTRY_UUID, publicId: 42n, topic: { slug: "cift-baslik", publicId: 8n } },
          {
            id: "22222222-2222-4222-8222-222222222222",
            publicId: 43n,
            topic: { slug: "tek-baslik", publicId: 7n },
          },
        ]),
      },
      $queryRaw: queryRaw,
    };
    const client = {
      $transaction: (work: (tx: typeof transaction) => unknown) => work(transaction),
    } as unknown as DatabaseClient;

    const index = await getEntryReferenceIndex(client, ["(bkz: #42) ve (bkz: #43)"]);

    expect(index.entries?.get(42)).toBe("/baslik/cift-baslik--8#entry-42");
    expect(index.entries?.get(43)).toBe("/entry/43");
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect((queryRaw.mock.calls[0]?.[0] as Prisma.Sql).values).toEqual([ENTRY_UUID]);
  });
});

describe("site içi arama entry sonuçları", () => {
  it("deney kohortu başlıktaki yere, kontrol /entry/N'ye bağlanır; başlık sonucu değişmez", async () => {
    const controlId = "22222222-2222-4222-8222-222222222222";
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        {
          type: "topic",
          id: "33333333-3333-4333-8333-333333333333",
          title: "Çift başlık",
          snippet: "Çift başlık",
          url: "/baslik/cift-baslik--8",
          rank: 3000,
          totalItems: 3,
        },
        {
          type: "entry",
          id: ENTRY_UUID,
          title: "Çift başlık",
          snippet: "gövde",
          url: "/entry/42",
          rank: 1000,
          totalItems: 3,
        },
        {
          type: "entry",
          id: controlId,
          title: "Tek başlık",
          snippet: "gövde",
          url: "/entry/43",
          rank: 1000,
          totalItems: 3,
        },
      ])
      .mockResolvedValueOnce([
        { id: ENTRY_UUID, publicId: 42n, topicSlug: "cift-baslik", topicPublicId: 8n, before: 25 },
        { id: controlId, publicId: 43n, topicSlug: "tek-baslik", topicPublicId: 7n, before: 25 },
      ]);
    const transaction = { $queryRaw: queryRaw };
    const client = {
      $transaction: (work: (tx: typeof transaction) => unknown) => work(transaction),
    } as unknown as DatabaseClient;

    const result = await searchAll(client, {
      query: "gövde",
      type: "all",
      page: 1,
      pageSize: 20,
      skip: 0,
    });

    expect(result.results.map((row) => row.url)).toEqual([
      "/baslik/cift-baslik--8",
      "/baslik/cift-baslik--8?page=2#entry-42",
      "/entry/43",
    ]);
  });
});
