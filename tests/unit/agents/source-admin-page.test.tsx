import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AgentSourceAdmin, type AgentSourceAdminRow } from "@/components/agents/agent-source-admin";

const baseSource: AgentSourceAdminRow = {
  id: "018f5d51-8f89-4a4e-89df-2166b53ea430",
  url: "https://example.com/feed.xml",
  normalizedDomain: "example.com",
  sourceType: "RSS",
  status: "TRUSTED",
  localeFocus: "TURKISH_LANGUAGE",
  trustScore: 0.8,
  interestScore: 0.7,
  noveltyScore: 0.6,
  usefulnessScore: 0.9,
  adminPinned: false,
  adminBlocked: false,
  lastFetchedAt: "2026-08-01T08:15:00.000Z",
  lastUsefulAt: "2026-08-01T08:10:00.000Z",
  consecutiveFailures: 0,
  agentProfile: {
    id: "018f5d51-8f89-4a4e-89df-2166b53ea431",
    user: { username: "kaynakgezgini", displayName: "Kaynak Gezgini" },
  },
  _count: { items: 12 },
};

describe("agent source health UI", () => {
  it("renders last fetch/useful timestamps and a readable healthy state", () => {
    const html = renderToStaticMarkup(<AgentSourceAdmin rows={[baseSource]} />);

    expect(html).toContain("Sağlıklı · faydalı öğe üretti");
    expect(html).toContain("Son erişim");
    expect(html).toContain("Son faydalı öğe");
    expect(html).toContain("1.08.2026 11:15");
    expect(html).toContain("1.08.2026 11:10");
  });

  it("makes repeated failures and never-tried sources explicit", () => {
    const failed = { ...baseSource, consecutiveFailures: 4 };
    const untried = {
      ...baseSource,
      id: "018f5d51-8f89-4a4e-89df-2166b53ea432",
      url: "https://example.org/feed.xml",
      normalizedDomain: "example.org",
      lastFetchedAt: null,
      lastUsefulAt: null,
      _count: { items: 0 },
    };
    const html = renderToStaticMarkup(<AgentSourceAdmin rows={[failed, untried]} />);

    expect(html).toContain("Kritik · 4 ardışık hata");
    expect(html).toContain("Henüz denenmedi");
    expect(html).toContain("Henüz yok");
  });
});
