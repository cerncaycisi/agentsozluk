import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  listAgentLifeEvents: vi.fn(),
  requestSession: vi.fn(),
}));

vi.mock("@/lib/auth/request-session", () => ({ requestSession: mocks.requestSession }));
vi.mock("@/lib/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/modules/agents", () => ({
  agentLifeQuerySchema: {
    parse: (value: Record<string, string | undefined>) => ({
      ...Object.fromEntries(Object.entries(value).filter(([, nested]) => nested !== undefined)),
      limit: Number(value.limit ?? 100),
      format: value.format ?? "json",
    }),
  },
  listAgentLifeEvents: mocks.listAgentLifeEvents,
}));

import { GET } from "@/app/api/v1/admin/agents/[agentId]/life/route";

const agentId = "00000000-0000-4000-8000-000000000010";
const runId = "00000000-0000-4000-8000-000000000020";
const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  user: { kind: "HUMAN" as const, role: "ADMIN" as const },
};

describe("agent life JSONL route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestSession.mockResolvedValue(session);
    mocks.getDatabase.mockReturnValue({});
    mocks.listAgentLifeEvents.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("streams every cursor page while preserving filters and bounded memory", async () => {
    mocks.listAgentLifeEvents
      .mockResolvedValueOnce({
        items: Array.from({ length: 100 }, (_, index) => ({
          id: String(1_000 - index),
          eventType: "OBSERVATION_RECORDED",
          summary: `Observation ${index + 1}`,
        })),
        nextCursor: "800",
      })
      .mockResolvedValueOnce({
        items: Array.from({ length: 25 }, (_, index) => ({
          id: String(125 - index),
          eventType: "OBSERVATION_RECORDED",
          summary: `Observation ${index + 101}`,
        })),
        nextCursor: null,
      });
    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/v1/admin/agents/${agentId}/life?format=jsonl&cursor=900&limit=3&eventType=OBSERVATION_RECORDED&runId=${runId}&from=2026-07-18T10%3A00%3A00.000Z&to=2026-07-18T11%3A00%3A00.000Z`,
      ),
      { params: Promise.resolve({ agentId }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const lines = (await response.text()).trim().split("\n");
    expect(lines).toHaveLength(125);
    expect(new Set(lines.map((line) => JSON.parse(line).id)).size).toBe(125);
    expect(mocks.listAgentLifeEvents).toHaveBeenNthCalledWith(
      1,
      {},
      expect.objectContaining({ actorKind: "HUMAN", actorRole: "ADMIN", origin: "API" }),
      agentId,
      expect.objectContaining({
        cursor: "900",
        limit: 500,
        eventType: "OBSERVATION_RECORDED",
        runId,
        from: "2026-07-18T10:00:00.000Z",
        to: "2026-07-18T11:00:00.000Z",
        format: "json",
      }),
    );
    expect(mocks.listAgentLifeEvents).toHaveBeenNthCalledWith(
      2,
      {},
      expect.any(Object),
      agentId,
      expect.objectContaining({ cursor: "800", limit: 500, format: "json" }),
    );
  });
});
