// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Yazar profilindeki sekmeler sunucu tarafında, yalnız URL'den çözülür.
 * Bu dosya üç şeyi kilitler:
 *   1. Sekme durumu `?tab=` içinde taşınır — istemci state'i yok, bu yüzden
 *      paylaşılan bağlantı doğru sekmeyi açar, geri tuşu ve JS'siz gezinme çalışır.
 *   2. Sekme etiketindeki sayı ile o sekmenin listesi aynı kaynaktan gelir.
 *   3. Sayfalama `tab` parametresini taşır; sekme değiştirmek sayfayı 1'e döndürür.
 */

const getPublicProfile = vi.hoisted(() => vi.fn());
const currentPageSession = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  permanentRedirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/components/seo/json-ld", () => ({ JsonLd: () => null }));
vi.mock("@/components/users/profile-actions", () => ({ ProfileActions: () => null }));
vi.mock("@/lib/db/client", () => ({ getDatabase: () => ({}) }));
vi.mock("@/config/env", () => ({ getEnvironment: () => ({ APP_URL: "https://ornek.test" }) }));
vi.mock("@/lib/auth/server-session", () => ({ currentPageSession }));
vi.mock("@/modules/users/application/profiles", () => ({ getPublicProfile }));
vi.mock("@/modules/interactions/application/interactions", () => ({
  getBlockState: async () => false,
  getUserFollowState: async () => ({ followed: false }),
}));
vi.mock("@/modules/indexing", () => ({
  getProfileIndexingDecision: async () => ({ index: true, follow: true }),
}));
vi.mock("@/modules/entries", () => ({ getEntryReferenceIndex: async () => ({}) }));

const PROFILE_URL = "/yazar/yazar1";

const profile = {
  id: "00000000-0000-4000-8000-000000000001",
  status: "ACTIVE" as const,
  username: "yazar1",
  publicSlug: "yazar1",
  displayName: "Yazar Bir",
  bio: null,
  createdAt: new Date("2026-01-02T10:00:00.000Z"),
  activeEntryCount: 128,
  openedActiveTopicCount: 14,
};

function entryFixture(publicId: number) {
  return {
    id: `00000000-0000-4000-8000-00000000020${publicId}`,
    publicId,
    body: `entry gövdesi ${publicId}`,
    score: 1,
    upvoteCount: 1,
    downvoteCount: 0,
    edited: false,
    bookmarkCount: 0,
    createdAt: new Date("2026-01-02T10:00:00.000Z"),
    updatedAt: new Date("2026-01-02T10:00:00.000Z"),
    topic: {
      id: "00000000-0000-4000-8000-000000000101",
      publicId: 101,
      title: "kanonik başlık",
      slug: "kanonik-baslik",
    },
  };
}

function topicFixture(publicId: number) {
  return {
    id: `00000000-0000-4000-8000-00000000030${publicId}`,
    publicId,
    title: `açtığı başlık ${publicId}`,
    slug: `actigi-baslik-${publicId}`,
    entryCount: 3,
    lastEntryAt: new Date("2026-01-03T10:00:00.000Z"),
  };
}

async function renderProfile(
  searchParams: { page?: string; tab?: string },
  result: {
    entries?: ReturnType<typeof entryFixture>[];
    topics?: ReturnType<typeof topicFixture>[];
    totalItems?: number;
  } = {},
) {
  const { default: PublicProfilePage } = await import("@/app/yazar/[username]/page");
  getPublicProfile.mockResolvedValue({
    profile,
    tab: searchParams.tab === "basliklar" ? "topics" : "entries",
    entries: result.entries ?? [],
    topics: result.topics ?? [],
    totalItems: result.totalItems ?? 0,
  });
  return renderToStaticMarkup(
    await PublicProfilePage({
      params: Promise.resolve({ username: "yazar1" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  currentPageSession.mockResolvedValue(null);
});

describe("yazar profili sekmeleri", () => {
  it("iki sekmeyi gerçek link olarak, sayılarıyla birlikte gösterir", async () => {
    const markup = await renderProfile({});
    expect(markup).toContain('aria-label="Profil sekmeleri"');
    expect(markup).toContain(`href="${PROFILE_URL}"`);
    expect(markup).toContain(`href="${PROFILE_URL}?tab=basliklar"`);
    expect(markup).toContain("Entry’ler (128)");
    expect(markup).toContain("Açtığı başlıklar (14)");
    // Sekme çubuğunda düğme yok: JS kapalıyken de gezilebilmesi buna bağlı.
    expect(markup).not.toContain("<button");
  });

  it("varsayılan sekme entryler'dir ve aria-current onu işaretler", async () => {
    const markup = await renderProfile({}, { entries: [entryFixture(1)], totalItems: 1 });
    expect(getPublicProfile).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ tab: "entries", skip: 0, take: 20 }),
    );
    expect(markup).toContain("entry gövdesi 1");
    expect(markup).not.toContain("açtığı başlık");
    expect(markup).toMatch(/aria-current="page"[^>]*href="\/yazar\/yazar1"/u);
  });

  it("tanınmayan tab değerinde varsayılan sekmeye düşer", async () => {
    await renderProfile({ tab: "favoriler" });
    expect(getPublicProfile).toHaveBeenCalledWith({}, expect.objectContaining({ tab: "entries" }));
  });

  it("?tab=basliklar başlık listesini yükler ve o sekmeyi işaretler", async () => {
    const markup = await renderProfile(
      { tab: "basliklar" },
      { topics: [topicFixture(1), topicFixture(2)], totalItems: 2 },
    );
    expect(getPublicProfile).toHaveBeenCalledWith({}, expect.objectContaining({ tab: "topics" }));
    expect(markup).toContain("açtığı başlık 1");
    expect(markup).toContain("açtığı başlık 2");
    expect(markup).toContain('href="/baslik/actigi-baslik-1--1"');
    expect(markup).not.toContain("entry gövdesi");
    expect(markup).toMatch(/aria-current="page"[^>]*href="\/yazar\/yazar1\?tab=basliklar"/u);
  });

  it("her sekmenin kendi boş durum mesajı vardır", async () => {
    const entriesMarkup = await renderProfile({});
    expect(entriesMarkup).toContain("Görüntülenebilen aktif entry bulunmuyor.");
    expect(entriesMarkup).not.toContain("açtığı aktif başlık bulunmuyor");

    const topicsMarkup = await renderProfile({ tab: "basliklar" });
    expect(topicsMarkup).toContain("Bu yazar henüz başlık açmamış.");
    expect(topicsMarkup).not.toContain("Görüntülenebilen aktif entry bulunmuyor.");
  });

  it("sayfalama linkleri açık sekmeyi taşır", async () => {
    const markup = await renderProfile(
      { tab: "basliklar", page: "2" },
      { topics: [topicFixture(1)], totalItems: 45 },
    );
    expect(getPublicProfile).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ tab: "topics", skip: 20, take: 20 }),
    );
    expect(markup).toContain(`href="${PROFILE_URL}?tab=basliklar&amp;page=3"`);
    expect(markup).toContain(`href="${PROFILE_URL}?tab=basliklar"`);
    expect(markup).not.toContain("?page=3");
  });

  it("entry sekmesinin sayfalaması tab parametresi taşımaz", async () => {
    const markup = await renderProfile({ page: "2" }, { entries: [], totalItems: 45 });
    expect(markup).toContain(`href="${PROFILE_URL}?page=3"`);
    expect(markup).not.toContain("tab=entryler");
  });

  it("sekme bağlantıları sayfayı sıfırlar", async () => {
    const markup = await renderProfile({ page: "3" }, { entries: [], totalItems: 100 });
    // Sekme çubuğundaki linklerde `page` yok; sekme değişince ilk sayfaya dönülür.
    expect(markup).toContain(`href="${PROFILE_URL}?tab=basliklar"`);
    expect(markup).not.toContain("tab=basliklar&amp;page=");
  });

  it("kanonik olmayan kullanıcı adında sekmeyi koruyarak yönlendirir", async () => {
    const { default: PublicProfilePage } = await import("@/app/yazar/[username]/page");
    getPublicProfile.mockResolvedValue({
      profile,
      tab: "topics",
      entries: [],
      topics: [],
      totalItems: 0,
    });
    await expect(
      PublicProfilePage({
        params: Promise.resolve({ username: "Yazar1" }),
        searchParams: Promise.resolve({ tab: "basliklar", page: "2" }),
      }),
    ).rejects.toThrow(`redirect:${PROFILE_URL}?tab=basliklar&page=2`);
  });
});

describe("yazar profili sekme metadata'sı", () => {
  it("canonical'ı parametresiz tutar ve sekmeli görünümü indekslemez", async () => {
    const { generateMetadata } = await import("@/app/yazar/[username]/page");
    getPublicProfile.mockResolvedValue({
      profile,
      tab: "topics",
      entries: [],
      topics: [],
      totalItems: 0,
    });
    const metadata = await generateMetadata({
      params: Promise.resolve({ username: "yazar1" }),
      searchParams: Promise.resolve({ tab: "basliklar" }),
    });
    expect(metadata.alternates?.canonical).toBe(PROFILE_URL);
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("parametresiz profili indekslenebilir bırakır", async () => {
    const { generateMetadata } = await import("@/app/yazar/[username]/page");
    getPublicProfile.mockResolvedValue({
      profile,
      tab: "entries",
      entries: [],
      topics: [],
      totalItems: 0,
    });
    const metadata = await generateMetadata({
      params: Promise.resolve({ username: "yazar1" }),
      searchParams: Promise.resolve({}),
    });
    expect(metadata.alternates?.canonical).toBe(PROFILE_URL);
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });
});
