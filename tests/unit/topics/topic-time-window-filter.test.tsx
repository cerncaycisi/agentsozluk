// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Başlık sayfasındaki zaman penceresi (`?window=`) şeridi.
 *
 * Pencere eskiden görünmez bir yan etkiydi: sidebar'ın ürettiği `?index=`
 * parametresi sessizce 24 saat uyguluyordu. Artık kendi şeridi ve kendi URL
 * parametresi var; `?index=` yalnız dışarıda paylaşılmış eski linkler için
 * okunuyor.
 */

const currentPageSession = vi.hoisted(() => vi.fn());
const getTopicByPublicId = vi.hoisted(() => vi.fn());
const getTopicEntries = vi.hoisted(() => vi.fn());
const robotsForCanonicalView = vi.hoisted(() =>
  vi.fn((base: { index: boolean; follow: boolean }, hasViewParameters: boolean) => ({
    index: base.index && !hasViewParameters,
    follow: true,
  })),
);

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  permanentRedirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/components/entries/create-entry-form", () => ({ CreateEntryForm: () => null }));
vi.mock("@/components/entries/entry-preview", () => ({ EntryPreview: () => null }));
vi.mock("@/components/seo/json-ld", () => ({ JsonLd: () => null }));
vi.mock("@/components/ui/pagination-links", () => ({
  PaginationLinks: ({ hrefFor }: { hrefFor: (page: number) => string }) => (
    <a data-testid="sonraki-sayfa" href={hrefFor(2)}>
      2
    </a>
  ),
}));
vi.mock("@/components/topics/topic-follow-button", () => ({ TopicFollowButton: () => null }));
vi.mock("@/components/topics/topic-report-button", () => ({ TopicReportButton: () => null }));
vi.mock("@/lib/db/client", () => ({ getDatabase: () => ({}) }));
vi.mock("@/config/env", () => ({ getEnvironment: () => ({ APP_URL: "https://ornek.test" }) }));
vi.mock("@/lib/auth/server-session", () => ({ currentPageSession }));
vi.mock("@/modules/entries/application/entries", () => ({
  getEntryReferenceIndex: async () => new Map(),
  getTopicEntries,
}));
vi.mock("@/modules/interactions/application/interactions", () => ({
  getViewerEntryStates: async () => [[], []],
}));
vi.mock("@/modules/moderation/application/capabilities", () => ({
  userHasModerationCapability: async () => false,
}));
vi.mock("@/modules/topics/application/topics", () => ({ getTopicByPublicId, getTopic: vi.fn() }));
vi.mock("@/modules/indexing", () => ({
  getTopicIndexingDecision: async () => ({ index: true, follow: true }),
}));
vi.mock("@/modules/indexing/domain/public-seo", () => ({
  absolutePublicUrl: (baseUrl: string, path: string) => new URL(path, baseUrl).toString(),
  buildTopicJsonLd: () => ({}),
  publicAlternates: () => ({}),
  publicProfileUrl: () => "/",
  robotsForCanonicalView,
}));
vi.mock("@/modules/rate-limit/application/rate-limit", () => ({
  enforceRateLimit: async () => undefined,
  ipRateLimitIdentifier: () => "ip",
  RATE_LIMIT_RULES: { searchAuthenticated: {}, searchVisitor: {} },
  requestIp: () => "203.0.113.1",
  userRateLimitIdentifier: () => "user",
}));

const SEGMENT = "test-baslik--42";
const TOPIC_URL = "/baslik/test-baslik--42";

const topicFixture = {
  id: "00000000-0000-4000-8000-000000000001",
  publicId: 42,
  slug: "test-baslik",
  title: "test başlık",
  status: "ACTIVE" as const,
  url: TOPIC_URL,
  entryCount: 120,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  createdById: "00000000-0000-4000-8000-000000000002",
  createdBy: { username: "ali" },
  following: false,
};

type Query = { page?: string; q?: string; sort?: string; index?: string; window?: string };

async function renderTopicPage(searchParams: Query) {
  const { default: TopicPage } = await import("@/app/baslik/[topic]/page");
  const element = await TopicPage({
    params: Promise.resolve({ topic: SEGMENT }),
    searchParams: Promise.resolve(searchParams),
  });
  render(element);
}

/**
 * Pencere artık beş `chip`'lik bir şerit değil, bir `<details>` açılır menüsü —
 * ama hâlâ `nav[aria-label="Zaman penceresi"]` altında ve hâlâ düz `<a href>`.
 * jsdom `<details>` kapalıyken içeriği gizlemediği için testler menüyü açmadan
 * da linkleri görebiliyor; açılış davranışı tarayıcıda doğrulandı.
 */
function windowStrip() {
  return screen.getByRole("navigation", { name: "Zaman penceresi" });
}

function windowTrigger() {
  const summary = windowStrip().querySelector("summary");
  if (!summary) throw new Error("Zaman penceresi tetikleyicisi yok");
  return summary;
}

function href(name: string | RegExp, strip: HTMLElement) {
  return within(strip).getByRole("link", { name }).getAttribute("href");
}

/** Başlığın üstündeki sayaç satırı. */
function eyebrow(): HTMLElement {
  const node = document.querySelector("p.eyebrow");
  if (!(node instanceof HTMLElement)) throw new Error("eyebrow yok");
  return node;
}

beforeEach(() => {
  getTopicByPublicId.mockResolvedValue(topicFixture);
  currentPageSession.mockResolvedValue(null);
  getTopicEntries.mockResolvedValue({ entries: [], totalItems: 7 });
  robotsForCanonicalView.mockClear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("başlık sayfası zaman penceresi şeridi", () => {
  it("beş kademeyi sırasıyla gösterir ve URL şemasını üretir", async () => {
    await renderTopicPage({});
    const strip = windowStrip();
    const links = within(strip).getAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual([
      "24 saat",
      "1 hafta",
      "1 ay",
      "3 ay",
      "tümü",
    ]);
    expect(href("24 saat", strip)).toBe(`${TOPIC_URL}?sort=oldest&window=24h`);
    expect(href("1 hafta", strip)).toBe(`${TOPIC_URL}?sort=oldest&window=1w`);
    expect(href("1 ay", strip)).toBe(`${TOPIC_URL}?sort=oldest&window=1m`);
    expect(href("3 ay", strip)).toBe(`${TOPIC_URL}?sort=oldest&window=3m`);
    expect(href("tümü", strip)).toBe(`${TOPIC_URL}?sort=oldest`);
  });

  it("varsayılan tümü kademesinde hiçbir pencere uygulamaz", async () => {
    await renderTopicPage({});

    expect(getTopicEntries.mock.calls[0]?.[1]).not.toHaveProperty("createdAtWindow");
    expect(within(windowStrip()).getByRole("link", { name: "tümü" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Filtresizken sayı başlığın tamamı; pencere adı yine yok, tetikleyici
    // varsayılan kademede de kendi etiketini taşıyor.
    expect(eyebrow()).toHaveTextContent("120 entry");
    expect(windowTrigger().textContent).toBe("Zaman penceresi: tüm zamanlar");
  });

  it.each([
    ["24h", 1, "son 24 saat"],
    ["1w", 7, "son 1 hafta"],
    ["1m", 30, "son 1 ay"],
    ["3m", 90, "son 3 ay"],
  ] as const)("%s kademesi %s günlük aralığı sorguya taşır", async (value, days, summary) => {
    await renderTopicPage({ window: value });

    const createdAtWindow = getTopicEntries.mock.calls[0]?.[1]?.createdAtWindow as {
      start: Date;
      end: Date;
    };
    expect(createdAtWindow.end.getTime() - createdAtWindow.start.getTime()).toBe(
      days * 24 * 60 * 60 * 1000,
    );
    // Pencerenin ADI eyebrow'da YAZMAZ: sayfada tam bir kez, pencere
    // tetikleyicisinin etiketinde geçer (`page.tsx`teki S3 kararı). Eyebrow
    // yalnız sayıyı taşır — ama sayı pencereye göre daralmış sayıdır.
    expect(eyebrow()).toHaveTextContent("7 entry");
    expect(eyebrow().textContent).not.toContain(summary);
    expect(windowTrigger().textContent).toBe(`Zaman penceresi: ${summary}`);
  });

  it("eski ?index= linklerini 24 saat penceresine eşler", async () => {
    await renderTopicPage({ index: "recent" });

    const createdAtWindow = getTopicEntries.mock.calls[0]?.[1]?.createdAtWindow as {
      start: Date;
      end: Date;
    };
    expect(createdAtWindow.end.getTime() - createdAtWindow.start.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
    expect(within(windowStrip()).getByRole("link", { name: "24 saat" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(eyebrow()).toHaveTextContent("7 entry");
    expect(windowTrigger().textContent).toBe("Zaman penceresi: son 24 saat");
  });

  it("aynı anda gelen ?window= parametresi eski ?index='i ezer", async () => {
    await renderTopicPage({ index: "trending", window: "1m" });

    const createdAtWindow = getTopicEntries.mock.calls[0]?.[1]?.createdAtWindow as {
      start: Date;
      end: Date;
    };
    expect(createdAtWindow.end.getTime() - createdAtWindow.start.getTime()).toBe(
      30 * 24 * 60 * 60 * 1000,
    );
  });

  it("tanınmayan pencere değerinde tümü kademesine düşer", async () => {
    await renderTopicPage({ window: "1y" });

    expect(getTopicEntries.mock.calls[0]?.[1]).not.toHaveProperty("createdAtWindow");
    expect(within(windowStrip()).getByRole("link", { name: "tümü" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("pencereyi sıralama, sayfalama ve arama arasında korur", async () => {
    await renderTopicPage({ window: "1w", q: "deneme" });

    const sortStrip = screen.getByRole("navigation", { name: "Entry sıralaması" });
    expect(href("En yüksek puan", sortStrip)).toBe(`${TOPIC_URL}?sort=top&window=1w&q=deneme`);
    expect(screen.getByTestId("sonraki-sayfa")).toHaveAttribute(
      "href",
      `${TOPIC_URL}?sort=oldest&window=1w&page=2&q=deneme`,
    );
    expect(screen.getByRole("link", { name: "Aramayı temizle" })).toHaveAttribute(
      "href",
      `${TOPIC_URL}?sort=oldest&window=1w`,
    );

    const search = screen.getByRole("search");
    const hidden = search.querySelector('input[name="window"]');
    expect(hidden).toHaveAttribute("value", "1w");
  });

  it("tümü kademesinde arama formuna gizli pencere alanı koymaz", async () => {
    await renderTopicPage({});

    expect(screen.getByRole("search").querySelector('input[name="window"]')).toBeNull();
  });

  it("pencere şeridi sıralama seçimini korur", async () => {
    await renderTopicPage({ sort: "newest" });

    expect(href("1 hafta", windowStrip())).toBe(`${TOPIC_URL}?sort=newest&window=1w`);
  });

  it("filtreli pencerede boş sonucu pencereyi söyleyerek anlatır", async () => {
    getTopicEntries.mockResolvedValue({ entries: [], totalItems: 0 });
    await renderTopicPage({ window: "3m" });

    expect(
      screen.getByText("Bu başlıkta son 3 ay içinde görüntülenebilen entry yok."),
    ).toBeInTheDocument();
  });

  it("tetikleyici seçili pencerenin kendisini yazar", async () => {
    await renderTopicPage({ window: "24h" });
    expect(windowTrigger().textContent).toBe("Zaman penceresi: son 24 saat");

    cleanup();
    await renderTopicPage({});
    // Varsayılan kademede de bilgi kaybolmuyor; yalnız adı değişiyor.
    expect(windowTrigger().textContent).toBe("Zaman penceresi: tüm zamanlar");
  });

  it("pencere menüsü JS'siz de çalışsın diye `details`, Radix değil", async () => {
    await renderTopicPage({});
    const details = windowStrip().querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.querySelector("summary")).not.toBeNull();
    // Menü içeriği düz `<a href>`; hiçbir düğme yok.
    expect(within(windowStrip()).queryAllByRole("button")).toHaveLength(0);
  });

  it("sıralama düz metin linkleri; dokunma hedefi 24px altına inmiyor", async () => {
    await renderTopicPage({});
    const strip = screen.getByRole("navigation", { name: "Entry sıralaması" });
    for (const link of within(strip).getAllByRole("link")) {
      expect(link.className).toContain("whitespace-nowrap");
      // `chip` kutusu kalktı; yükseklik `min-h-9` (36px) ile korunuyor (SC 2.5.8).
      expect(link.className).toContain("min-h-9");
      expect(link.className).not.toContain("chip");
    }
  });
});

describe("başlık sayfası zaman penceresi robots davranışı", () => {
  async function robotsFlagFor(searchParams: Query) {
    const { generateMetadata } = await import("@/app/baslik/[topic]/page");
    await generateMetadata({
      params: Promise.resolve({ topic: SEGMENT }),
      searchParams: Promise.resolve(searchParams),
    });
    return robotsForCanonicalView.mock.calls.at(-1)?.[1];
  }

  it("filtresiz görünümü görünüm parametresi saymaz", async () => {
    expect(await robotsFlagFor({})).toBe(false);
  });

  it.each(["24h", "1w", "1m", "3m", "all"])(
    "?window=%s görünümünü görünüm parametresi olarak bildirir",
    async (value) => {
      expect(await robotsFlagFor({ window: value })).toBe(true);
    },
  );

  it("eski ?index= görünümünü de görünüm parametresi olarak bildirir", async () => {
    expect(await robotsFlagFor({ index: "recent" })).toBe(true);
  });
});
