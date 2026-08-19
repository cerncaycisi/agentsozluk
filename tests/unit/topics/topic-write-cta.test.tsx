// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * `src/app/baslik/[topic]/page.tsx` sayfanın en altındaki yazma alanını dört dala
 * ayırır: onaylı yazar composer'ı görür, kalan üç ziyaretçi tipi kendi durum
 * mesajını görür. `HIDDEN` başlıkta hiçbiri gösterilmez.
 *
 * Onay bekleyen yazar metni bilerek `src/app/baslik/ac/page.tsx`'ten farklıdır:
 * başlık sayfasında kullanıcı entry yazmak ister, başlık açmak değil.
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
vi.mock("@/components/entries/create-entry-form", () => ({
  CreateEntryForm: () => <div>COMPOSER</div>,
}));
vi.mock("@/components/entries/entry-preview", () => ({ EntryPreview: () => null }));
vi.mock("@/components/seo/json-ld", () => ({ JsonLd: () => null }));
vi.mock("@/components/ui/pagination-links", () => ({ PaginationLinks: () => null }));
vi.mock("@/components/topics/topic-follow-button", () => ({ TopicFollowButton: () => null }));
vi.mock("@/components/topics/topic-report-button", () => ({ TopicReportButton: () => null }));
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
vi.mock("@/modules/indexing", () => ({ getTopicIndexingDecision: async () => ({}) }));
vi.mock("@/modules/indexing/domain/public-seo", () => ({
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

const SEGMENT = "test-baslik--42";
const TOPIC_URL = "/baslik/test-baslik--42";

const GUEST_TEXT = "Bu başlığa yazmak için giriş yapın.";
const PENDING_TEXT = "Yazar hesabınız admin onayı bekliyor. Onaydan sonra entry yazabilirsiniz.";
const SUSPENDED_TEXT = "Askıya alınmış hesapla içerik oluşturamazsınız.";
const COMPOSER = "COMPOSER";

const guest = null;
const pendingWriter = {
  userId: "00000000-0000-4000-8000-000000000009",
  user: { role: "USER", status: "ACTIVE", writerApproved: false },
};
const suspendedUser = {
  userId: "00000000-0000-4000-8000-000000000009",
  user: { role: "USER", status: "SUSPENDED", writerApproved: true },
};
const approvedWriter = {
  userId: "00000000-0000-4000-8000-000000000009",
  user: { role: "USER", status: "ACTIVE", writerApproved: true },
};

function topicFixture(status: "ACTIVE" | "HIDDEN") {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    publicId: 42,
    slug: "test-baslik",
    title: "test başlık",
    status,
    url: TOPIC_URL,
    entryCount: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    createdById: "00000000-0000-4000-8000-000000000002",
    createdBy: { username: "ali" },
    following: false,
  };
}

async function renderTopicPage(status: "ACTIVE" | "HIDDEN", session: unknown) {
  const { default: TopicPage } = await import("@/app/baslik/[topic]/page");
  getTopicByPublicId.mockResolvedValue(topicFixture(status));
  currentPageSession.mockResolvedValue(session);
  const element = await TopicPage({
    params: Promise.resolve({ topic: SEGMENT }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(element);
}

describe("başlık sayfası yazma CTA'sı", () => {
  it("misafire giriş/kayıt CTA'sını dönüş adresiyle gösterir", async () => {
    const markup = await renderTopicPage("ACTIVE", guest);
    expect(markup).toContain(GUEST_TEXT);
    expect(markup).toContain('href="/kayit"');
    expect(markup).toContain(`href="/giris?next=${encodeURIComponent(TOPIC_URL)}"`);
    expect(markup).not.toContain(COMPOSER);
    expect(markup).not.toContain(PENDING_TEXT);
    expect(markup).not.toContain(SUSPENDED_TEXT);
  });

  it("onay bekleyen yazara entry odaklı onay mesajını gösterir", async () => {
    const markup = await renderTopicPage("ACTIVE", pendingWriter);
    expect(markup).toContain(PENDING_TEXT);
    expect(markup).not.toContain("başlık açabilirsiniz");
    expect(markup).not.toContain(COMPOSER);
    expect(markup).not.toContain(GUEST_TEXT);
    expect(markup).not.toContain(SUSPENDED_TEXT);
  });

  it("askıya alınmış kullanıcıya destructive uyarıyı gösterir", async () => {
    const markup = await renderTopicPage("ACTIVE", suspendedUser);
    expect(markup).toContain(SUSPENDED_TEXT);
    expect(markup).toContain("text-destructive");
    expect(markup).not.toContain(COMPOSER);
    expect(markup).not.toContain(GUEST_TEXT);
    expect(markup).not.toContain(PENDING_TEXT);
  });

  it("onaylı yazarda composer aynı yerde kalır ve hiçbir durum kutusu çıkmaz", async () => {
    const markup = await renderTopicPage("ACTIVE", approvedWriter);
    expect(markup).toContain(COMPOSER);
    expect(markup).not.toContain(GUEST_TEXT);
    expect(markup).not.toContain(PENDING_TEXT);
    expect(markup).not.toContain(SUSPENDED_TEXT);
  });

  it.each([
    ["misafir", guest],
    ["onay bekleyen yazar", pendingWriter],
    ["askıya alınmış kullanıcı", suspendedUser],
    ["onaylı yazar", approvedWriter],
  ])("gizlenmiş başlıkta %s hiçbir kutu görmez", async (_label, session) => {
    const markup = await renderTopicPage("HIDDEN", session);
    expect(markup).toContain("gizlenmiş başlık");
    expect(markup).not.toContain(COMPOSER);
    expect(markup).not.toContain(GUEST_TEXT);
    expect(markup).not.toContain(PENDING_TEXT);
    expect(markup).not.toContain(SUSPENDED_TEXT);
    expect(markup).not.toContain("/giris?next=");
  });
});
