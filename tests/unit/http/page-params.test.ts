import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentPageSession: vi.fn(),
  getDatabase: vi.fn(),
  getEntry: vi.fn(),
  getEntryRevisions: vi.fn(),
  getModerationReport: vi.fn(),
  getViewerEntryStates: vi.fn(),
  requireModerationPage: vi.fn(),
  requirePageSession: vi.fn(),
  notFound: vi.fn(() => {
    throw Object.assign(new Error("not found"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  permanentRedirect: vi.fn(),
}));
vi.mock("@/components/entries/entry-preview", () => ({ EntryPreview: () => null }));
vi.mock("@/components/moderation/confirm-action", () => ({ ConfirmAction: () => null }));
vi.mock("@/components/moderation/moderation-nav", () => ({ ModerationLayout: () => null }));
vi.mock("@/components/ui/pagination-links", () => ({ PaginationLinks: () => null }));
vi.mock("@/lib/auth/server-session", () => ({
  currentPageSession: mocks.currentPageSession,
  requireModerationPage: mocks.requireModerationPage,
  requirePageSession: mocks.requirePageSession,
}));
vi.mock("@/lib/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/modules/auth/domain/actor", () => ({ actorFromSession: vi.fn() }));
vi.mock("@/modules/entries/application/entries", () => ({
  getEntry: mocks.getEntry,
  getEntryRevisions: mocks.getEntryRevisions,
}));
vi.mock("@/modules/interactions/application/interactions", () => ({
  getViewerEntryStates: mocks.getViewerEntryStates,
}));
vi.mock("@/modules/moderation/application/reports", () => ({
  getModerationReport: mocks.getModerationReport,
}));

import EntryPage from "@/app/entry/[id]/page";
import EntryRevisionsPage from "@/app/entry/[id]/revizyonlar/page";
import ReportDetailPage from "@/app/moderasyon/raporlar/[id]/page";
import { pageUuidFrom } from "@/lib/http/page-params";

describe("server page path parameters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes valid UUIDs", () => {
    expect(pageUuidFrom("018F5D51-8F89-4A4E-89DF-2166B53EA41F")).toBe(
      "018f5d51-8f89-4a4e-89df-2166b53ea41f",
    );
  });

  it("returns the page-level 404 sentinel for malformed UUIDs", () => {
    expect(() => pageUuidFrom("not-a-uuid")).toThrow(
      expect.objectContaining({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }),
    );
  });

  it("rejects a malformed entry route before session or database access", async () => {
    await expect(
      EntryPage({ params: Promise.resolve({ id: "not-a-uuid" }) }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(mocks.currentPageSession).not.toHaveBeenCalled();
    expect(mocks.getDatabase).not.toHaveBeenCalled();
    expect(mocks.getEntry).not.toHaveBeenCalled();
  });

  it("rejects malformed revision and report routes before authorization access", async () => {
    await expect(
      EntryRevisionsPage({
        params: Promise.resolve({ id: "not-a-uuid" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    await expect(
      ReportDetailPage({ params: Promise.resolve({ id: "not-a-uuid" }) }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

    expect(mocks.requirePageSession).not.toHaveBeenCalled();
    expect(mocks.requireModerationPage).not.toHaveBeenCalled();
    expect(mocks.getDatabase).not.toHaveBeenCalled();
    expect(mocks.getEntryRevisions).not.toHaveBeenCalled();
    expect(mocks.getModerationReport).not.toHaveBeenCalled();
  });
});
