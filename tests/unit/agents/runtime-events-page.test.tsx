import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actorFromSession: vi.fn(),
  getDatabase: vi.fn(),
  getRuntimeEventHistoryPage: vi.fn(),
  requireAgentAdminPage: vi.fn(),
}));

vi.mock("@/components/agents/agent-runtime-events", () => ({
  AgentRuntimeEvents: ({
    live,
    includeTechnical,
    initialEvents,
  }: {
    live: boolean;
    includeTechnical: boolean;
    initialEvents: unknown[];
  }) => (
    <div
      data-testid="runtime-events"
      data-live={String(live)}
      data-technical={String(includeTechnical)}
      data-count={String(initialEvents.length)}
    />
  ),
}));
vi.mock("@/components/moderation/moderation-nav", () => ({
  ModerationLayout: ({
    title,
    description,
    children,
  }: {
    title: string;
    description: string;
    children: React.ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
}));
vi.mock("@/lib/auth/server-session", () => ({
  requireAgentAdminPage: mocks.requireAgentAdminPage,
}));
vi.mock("@/lib/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/modules/agents", () => ({
  getRuntimeEventHistoryPage: mocks.getRuntimeEventHistoryPage,
}));
vi.mock("@/modules/auth/domain/actor", () => ({ actorFromSession: mocks.actorFromSession }));

import AgentRuntimeEventsPage from "@/app/moderasyon/agentlar/olaylar/page";

describe("agent runtime events page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAgentAdminPage.mockResolvedValue({
      userId: "018f5d51-8f89-4a4e-89df-2166b53ea422",
      user: { kind: "HUMAN", role: "ADMIN", status: "ACTIVE" },
    });
    mocks.getDatabase.mockReturnValue({});
    mocks.actorFromSession.mockReturnValue({ actorRole: "ADMIN", actorKind: "HUMAN" });
    mocks.getRuntimeEventHistoryPage.mockResolvedValue({
      events: [
        {
          id: "42",
          agentProfileId: null,
          runId: null,
          eventType: "run.completed",
          safeMessage: "Run tamamlandı.",
          metadata: {},
          agentProfile: null,
          createdAt: new Date("2026-07-28T06:00:00.000Z"),
        },
      ],
      totalItems: 12,
      nextBeforeId: "42",
    });
  });

  it("defaults to the readable non-heartbeat stream", async () => {
    const page = await AgentRuntimeEventsPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(mocks.getRuntimeEventHistoryPage).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ actorRole: "ADMIN", actorKind: "HUMAN" }),
      { take: 50, includeTechnical: false },
    );
    expect(html).toContain("Okunur görünüm");
    expect(html).toContain("Teknik olayları göster");
    expect(html).toContain('href="/moderasyon/agentlar/olaylar?view=technical"');
    expect(html).toContain('data-live="true"');
    expect(html).toContain('data-technical="false"');
  });

  it("preserves the explicit technical filter across history pagination", async () => {
    const page = await AgentRuntimeEventsPage({
      searchParams: Promise.resolve({ beforeId: "100", view: "technical" }),
    });
    const html = renderToStaticMarkup(page);

    expect(mocks.getRuntimeEventHistoryPage).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ actorRole: "ADMIN", actorKind: "HUMAN" }),
      { beforeId: 100n, take: 50, includeTechnical: true },
    );
    expect(html).toContain("Teknik görünüm");
    expect(html).toContain("Okunur olaylara dön");
    expect(html).toContain("beforeId=42&amp;view=technical");
    expect(html).toContain('href="/moderasyon/agentlar/olaylar?view=technical"');
    expect(html).toContain('data-live="false"');
    expect(html).toContain('data-technical="true"');
  });
});
