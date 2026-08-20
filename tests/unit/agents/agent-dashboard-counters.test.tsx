import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actorFromSession: vi.fn(),
  getDatabase: vi.fn(),
  getGlobalSettings: vi.fn(),
  listAgentDashboard: vi.fn(),
  requireAgentAdminPage: vi.fn(),
}));

vi.mock("@/components/agents/agent-admin-forms", () => ({
  AgentCredentialRotateForm: () => null,
  AgentLifecycleForm: () => null,
  AgentQuickRunActions: () => null,
  AgentRunCommands: () => null,
  BulkAgentRunForm: () => null,
}));
vi.mock("@/components/moderation/moderation-nav", () => ({
  ModerationLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/ui/pagination-links", () => ({ PaginationLinks: () => null }));
vi.mock("@/lib/auth/server-session", () => ({
  requireAgentAdminPage: mocks.requireAgentAdminPage,
}));
vi.mock("@/lib/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/modules/agents", () => ({
  getGlobalSettings: mocks.getGlobalSettings,
  listAgentDashboard: mocks.listAgentDashboard,
}));
vi.mock("@/modules/auth/domain/actor", () => ({ actorFromSession: mocks.actorFromSession }));

import AgentDashboardPage from "@/app/moderasyon/agentlar/page";

const agentId = "018f5d51-8f89-4a4e-89df-2166b53ea420";

/*
  E1: "Bugünkü entry" etiketi yaşam boyu toplamı gösteriyordu; canlıda görülen
  576 yanlış bir "bugün" değil, doğru bir lifetime idi. Gün penceresi artık
  kaynak tablolardan sayılıyor, birikmiş sayaçlar ise "Toplam" adıyla duruyor.
  Bu test iki pencerenin bir daha karışmamasını sabitler.
*/
function dashboardAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: agentId,
    user: { displayName: "Katman İzci", username: "katmanizci", bio: null },
    lifecycleStatus: "ACTIVE",
    runtimeStatus: "SUCCEEDED",
    runtimeReadiness: {
      ready: true,
      mode: "LEGACY",
      reason: "LEGACY_UNVERIFIED",
      syncedAt: null,
    },
    lastHeartbeatAt: null,
    currentRun: null,
    todayWindow: {
      start: new Date("2026-08-19T21:00:00.000Z"),
      end: new Date("2026-08-20T21:00:00.000Z"),
    },
    today: { publishedEntries: 3, createdTopics: 1, votes: 7, sourceReads: 5 },
    lifetime: { publishedEntries: 576, createdTopics: 498, votes: 1_204, sourceReads: 900 },
    queueLength: 0,
    nextRunAt: null,
    lastEntry: null,
    personaVersion: 1,
    sourceCount: 4,
    successRate24h: 1,
    p75RunDurationMs: 60_000,
    codexInvocations: 1,
    averageEntriesPerRun: 1,
    consecutiveFailures: 0,
    latestUsageMetadata: null,
    lastError: null,
    ...overrides,
  };
}

async function render() {
  return renderToStaticMarkup(await AgentDashboardPage({ searchParams: Promise.resolve({}) }));
}

describe("agent dashboard daily counters", () => {
  beforeEach(() => {
    mocks.requireAgentAdminPage.mockResolvedValue({ userId: "admin" });
    mocks.actorFromSession.mockReturnValue({ actorId: "admin" });
    mocks.getGlobalSettings.mockResolvedValue({
      runtimeEnabled: true,
      schedulerEnabled: true,
      publishEnabled: true,
      publicWriteEnabled: true,
      runtimeOperatingMode: "NORMAL",
      codexConcurrency: 1,
    });
    mocks.listAgentDashboard.mockResolvedValue([dashboardAgent()]);
  });

  it("shows the day-window counts under the 'bugünkü' labels, not the lifetime totals", async () => {
    const html = await render();

    const todayEntry = html.indexOf("Bugünkü entry");
    const todayTopic = html.indexOf("Bugünkü başlık");
    expect(todayEntry).toBeGreaterThan(-1);
    expect(html.slice(todayEntry, todayEntry + 200)).toContain(">3<");
    expect(html.slice(todayTopic, todayTopic + 200)).toContain(">1<");
    expect(html.slice(todayEntry, todayEntry + 200)).not.toContain("576");
  });

  it("keeps the monotonic runtime counters visible under a truthful 'toplam' label", async () => {
    const html = await render();

    const lifetimeEntry = html.indexOf("Toplam entry");
    expect(lifetimeEntry).toBeGreaterThan(-1);
    expect(html.slice(lifetimeEntry, lifetimeEntry + 200)).toContain(">576<");
    expect(html).toContain("Toplam başlık");
    expect(html).toContain("Toplam oy");
    expect(html).toContain("Toplam kaynak okuma");
  });

  it("names the calendar day the 'bugünkü' labels refer to", async () => {
    const html = await render();

    expect(html).toContain("20 Ağu 2026");
    expect(html).toContain("Europe/Istanbul");
  });

  it("shows zero for an agent that produced nothing today even though it has a large lifetime", async () => {
    mocks.listAgentDashboard.mockResolvedValue([
      dashboardAgent({
        today: { publishedEntries: 0, createdTopics: 0, votes: 0, sourceReads: 0 },
      }),
    ]);

    const html = await render();

    const todayEntry = html.indexOf("Bugünkü entry");
    expect(html.slice(todayEntry, todayEntry + 200)).toContain(">0<");
    expect(html).toContain(">576<");
  });
});
