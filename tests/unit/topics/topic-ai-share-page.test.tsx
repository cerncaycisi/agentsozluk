// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Paylaş menüsünün başlık sayfasına bağlanışı.
 *
 * Buradaki tek iddia bileşenin kendi testinde kanıtlanamaz: sayfanın menüye
 * **mutlak** bir adres geçirdiği. `topic.url` göreli (`/baslik/...`) döner;
 * mutlaklaştırma `APP_URL` ile sayfada yapılır.
 */

const currentPageSession = vi.hoisted(() => vi.fn());
const getTopicByPublicId = vi.hoisted(() => vi.fn());

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
vi.mock("@/components/ui/pagination-links", () => ({ PaginationLinks: () => null }));
vi.mock("@/components/topics/topic-follow-button", () => ({ TopicFollowButton: () => null }));
vi.mock("@/lib/db/client", () => ({ getDatabase: () => ({}) }));
vi.mock("@/config/env", () => ({ getEnvironment: () => ({ APP_URL: "https://ornek.test" }) }));
vi.mock("@/lib/auth/server-session", () => ({ currentPageSession }));
vi.mock("@/modules/entries/application/entries", () => ({
  getEntryReferenceIndex: async () => new Map(),
  getTopicEntries: async () => ({ entries: [], totalItems: 0 }),
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
  robotsForCanonicalView: () => ({}),
}));
vi.mock("@/modules/rate-limit/application/rate-limit", () => ({
  enforceRateLimit: async () => undefined,
  ipRateLimitIdentifier: () => "ip",
  RATE_LIMIT_RULES: { searchAuthenticated: {}, searchVisitor: {} },
  requestIp: () => "203.0.113.1",
  userRateLimitIdentifier: () => "user",
}));

// Slug ASCII, başlık değil: mutlak URL ile prompt metni farklı yazımlar taşır.
const SEGMENT = "gunesamagi--7";
const topicFixture = {
  id: "00000000-0000-4000-8000-000000000001",
  publicId: 7,
  slug: "gunesamagi",
  title: "Güneşhamağı",
  status: "ACTIVE" as const,
  url: "/baslik/gunesamagi--7",
  entryCount: 12,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  createdById: "00000000-0000-4000-8000-000000000002",
  createdBy: { username: "ali" },
  following: false,
};

async function renderTopicPage() {
  const { default: TopicPage } = await import("@/app/baslik/[topic]/page");
  render(
    await TopicPage({
      params: Promise.resolve({ topic: SEGMENT }),
      searchParams: Promise.resolve({}),
    }),
  );
}

beforeEach(() => {
  getTopicByPublicId.mockResolvedValue(topicFixture);
  currentPageSession.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("başlık sayfası yapay zekâ paylaşımı", () => {
  it("misafire de görünür ve dört kanala mutlak adres taşır", async () => {
    const user = userEvent.setup();
    await renderTopicPage();

    // Paylaşım ⋮ menüsünün "Paylaş" alt menüsünde; misafirde de açılıyor.
    screen.getByRole("button", { name: "Diğer başlık işlemleri" }).focus();
    await user.keyboard("{Enter}");
    const shareTrigger = await screen.findByRole("menuitem", { name: "Paylaş" });
    await user.keyboard("{ArrowRight}");
    const items = (await screen.findAllByRole("menuitem")).filter((item) => item !== shareTrigger);
    expect(items).toHaveLength(4);

    for (const item of items) {
      const query = new URL(item.getAttribute("href") ?? "").searchParams;
      const prompt = query.get("q") ?? query.get("text") ?? "";
      // Göreli `/baslik/...` değil, `APP_URL` ile mutlaklaştırılmış adres.
      expect(prompt).toContain("https://ornek.test/baslik/gunesamagi--7");
      expect(prompt).not.toMatch(/(?:^|\s)\/baslik\//u);
      expect(prompt).toContain("Güneşhamağı");
    }
  });

  it("gizlenmiş başlıkta paylaşımı hiç sunmaz", async () => {
    getTopicByPublicId.mockResolvedValue({ ...topicFixture, status: "HIDDEN" as const });
    await renderTopicPage();

    expect(screen.queryByRole("button", { name: "Diğer başlık işlemleri" })).toBeNull();
    expect(screen.getByText("gizlenmiş başlık")).toBeInTheDocument();
  });
});
