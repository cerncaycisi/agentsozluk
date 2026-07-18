import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAgentContentRecords: vi.fn(),
  getDatabase: vi.fn(),
  listAgentDashboard: vi.fn(),
  requestSession: vi.fn(),
  requireAgentAdminPage: vi.fn(),
}));

vi.mock("@/components/agents/agent-content-moderation", () => ({
  AgentContentModeration: () => null,
}));
vi.mock("@/components/moderation/moderation-nav", () => ({ ModerationLayout: () => null }));
vi.mock("@/components/ui/pagination-links", () => ({ PaginationLinks: () => null }));
vi.mock("@/lib/auth/request-session", () => ({ requestSession: mocks.requestSession }));
vi.mock("@/lib/auth/server-session", () => ({
  requireAgentAdminPage: mocks.requireAgentAdminPage,
}));
vi.mock("@/lib/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/modules/agents", () => ({ listAgentDashboard: mocks.listAgentDashboard }));
vi.mock("@/modules/moderation", () => ({
  getAgentContentRecords: mocks.getAgentContentRecords,
}));

import { GET } from "@/app/api/v1/admin/agent-content/route";
import AgentContentPage from "@/app/moderasyon/agent-icerikleri/page";

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  user: { kind: "HUMAN" as const, role: "ADMIN" as const },
};

describe("agent content override query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestSession.mockResolvedValue(session);
    mocks.requireAgentAdminPage.mockResolvedValue(session);
    mocks.getDatabase.mockReturnValue({});
    mocks.getAgentContentRecords.mockResolvedValue([[], 0]);
    mocks.listAgentDashboard.mockResolvedValue([]);
  });

  it("passes a valid API override filter to the authorized content query", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/v1/admin/agent-content?overrideStatus=WITH_OVERRIDE",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.getAgentContentRecords).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ actorRole: "ADMIN", origin: "API" }),
      expect.objectContaining({ overrideStatus: "WITH_OVERRIDE", skip: 0, take: 20 }),
    );
  });

  it("ignores an unknown API override filter instead of widening its meaning", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/v1/admin/agent-content?overrideStatus=ANY_OVERRIDE",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.getAgentContentRecords.mock.calls[0]?.[2]).not.toHaveProperty("overrideStatus");
  });

  it("passes the dashboard override filter and keeps it in the rendered query", async () => {
    const page = await AgentContentPage({
      searchParams: Promise.resolve({ overrideStatus: "WITHOUT_OVERRIDE" }),
    });

    expect(mocks.getAgentContentRecords).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ actorRole: "ADMIN", origin: "WEB" }),
      expect.objectContaining({ overrideStatus: "WITHOUT_OVERRIDE", skip: 0, take: 20 }),
    );
    expect(page).toBeTruthy();
  });
});
