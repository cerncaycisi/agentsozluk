// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/http/client", () => ({
  apiRequest,
  ClientApiError: class ClientApiError extends Error {},
}));

import {
  AgentLifeTimeline,
  type AgentLifeEventView,
} from "@/components/agents/agent-life-timeline";

const event: AgentLifeEventView = {
  id: "41",
  agentProfileId: "11111111-1111-4111-8111-111111111111",
  runId: "22222222-2222-4222-8222-222222222222",
  actionId: null,
  decisionSeq: 3,
  eventType: "DECISION_STEP_RECORDED",
  subject: { kind: "OPTION_REJECTED", label: "Entry yazma seçeneği" },
  summary: "Kanıt yetersiz olduğu için seçenek reddedildi.",
  confidence: 0.74,
  evidenceIds: ["source:17", "entry:91"],
  causedBy: ["39", "40"],
  before: { belief: "belirsiz" },
  after: { belief: "bekle", unsafe: "<script>window.evil=true</script>" },
  changedFields: ["belief", "unsafe"],
  metadata: { disposition: "REJECTED" },
  occurredAt: "2026-07-18T20:00:00.000Z",
  createdAt: "2026-07-18T20:00:00.100Z",
  schemaVersion: 1,
  agentSequence: "12",
  batchId: "d".repeat(64),
  batchSequence: 4,
  contentHash: "a".repeat(64),
  eventHash: "b".repeat(64),
  previousEventHash: "c".repeat(64),
};

describe("agent life timeline", () => {
  beforeEach(() => {
    apiRequest.mockReset().mockResolvedValue({ items: [event], nextCursor: null });
  });

  afterEach(() => cleanup());

  it("shows declared decisions, causal evidence and server-recorded before/after safely", async () => {
    const { container } = render(<AgentLifeTimeline agentId={event.agentProfileId} />);

    expect(screen.getByText("Ajanın beyan ettiği karar günlüğü")).toBeInTheDocument();
    expect(screen.getByText(/erişilemeyen ham model iç tokenlarını değil/i)).toBeInTheDocument();
    expect(await screen.findByText(event.summary)).toBeInTheDocument();
    expect(screen.getByText("Reddedilen seçenek")).toBeInTheDocument();
    expect(screen.getByText("Entry yazma seçeneği")).toBeInTheDocument();
    expect(screen.getByText("Değişen alanlar: belief · unsafe")).toBeInTheDocument();
    expect(container.querySelector('[data-decision-kind="OPTION_REJECTED"]')).not.toBeNull();
    expect(screen.getByText("source:17 · entry:91")).toBeInTheDocument();
    expect(screen.getByText("39 · 40")).toBeInTheDocument();
    expect(screen.getByText(/"belief": "belirsiz"/)).toBeInTheDocument();
    expect(screen.getByText(/window\.evil=true/)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });

  it("renders observation and action subject objects and nullable sequences without crashing", async () => {
    apiRequest.mockResolvedValueOnce({
      items: [
        {
          ...event,
          id: "39",
          agentSequence: null,
          eventType: "OBSERVATION_RECORDED",
          subject: {
            type: "TOPIC",
            id: "33333333-3333-4333-8333-333333333333",
          },
        },
        {
          ...event,
          id: "40",
          agentSequence: "11",
          eventType: "ACTION_PROPOSED",
          subject: {
            type: "ACTION",
            id: "44444444-4444-4444-8444-444444444444",
            actionType: "CREATE_ENTRY",
            sequence: 2,
          },
        },
      ],
      nextCursor: null,
    });

    render(<AgentLifeTimeline agentId={event.agentProfileId} />);

    expect(
      await screen.findByText("TOPIC · 33333333-3333-4333-8333-333333333333"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("CREATE_ENTRY · #2 · 44444444-4444-4444-8444-444444444444"),
    ).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("Reddedilen seçenek")).not.toBeInTheDocument();
  });

  it("uses cursor pagination without dropping the first page", async () => {
    apiRequest
      .mockResolvedValueOnce({ items: [event], nextCursor: "cursor-41" })
      .mockResolvedValueOnce({
        items: [{ ...event, id: "42", agentSequence: "13", summary: "Bir sonraki olay." }],
        nextCursor: null,
      });
    const user = userEvent.setup();
    render(<AgentLifeTimeline agentId={event.agentProfileId} />);

    await screen.findByText(event.summary);
    await user.click(screen.getByRole("button", { name: "Daha eski olayları yükle" }));

    expect(await screen.findByText("Bir sonraki olay.")).toBeInTheDocument();
    expect(screen.getByText(event.summary)).toBeInTheDocument();
    expect(apiRequest.mock.calls[1]?.[0]).toContain("cursor=cursor-41");
  });

  it("applies event and run filters and exposes the same filter as JSONL export", async () => {
    const user = userEvent.setup();
    render(<AgentLifeTimeline agentId={event.agentProfileId} />);
    await screen.findByText(event.summary);

    await user.type(screen.getByLabelText("Olay türü"), "BELIEF_CHANGED");
    await user.type(screen.getByLabelText("Run ID"), event.runId!);
    await user.click(screen.getByRole("button", { name: "Filtrele" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    expect(apiRequest.mock.calls[1]?.[0]).toContain("eventType=BELIEF_CHANGED");
    expect(apiRequest.mock.calls[1]?.[0]).toContain(`runId=${event.runId}`);
    const exportLink = screen.getByRole("link", { name: "Filtrelenmiş JSONL indir" });
    expect(exportLink.getAttribute("href")).toContain("format=jsonl");
    expect(exportLink.getAttribute("href")).toContain("eventType=BELIEF_CHANGED");
  });

  it("clears stale events and cursor while a filtered request is pending and after failure", async () => {
    let rejectFilteredRequest: ((reason?: unknown) => void) | undefined;
    const filteredRequest = new Promise<never>((_resolve, reject) => {
      rejectFilteredRequest = reject;
    });
    apiRequest
      .mockResolvedValueOnce({ items: [event], nextCursor: "cursor-41" })
      .mockReturnValueOnce(filteredRequest);
    const user = userEvent.setup();
    render(<AgentLifeTimeline agentId={event.agentProfileId} />);
    await screen.findByText(event.summary);

    await user.type(screen.getByLabelText("Olay türü"), "BELIEF_CHANGED");
    await user.click(screen.getByRole("button", { name: "Filtrele" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(event.summary)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Daha eski olayları yükle" }),
    ).not.toBeInTheDocument();

    rejectFilteredRequest?.(new Error("filter failed"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Hayat defteri yüklenemedi");
    expect(screen.queryByText(event.summary)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Daha eski olayları yükle" }),
    ).not.toBeInTheDocument();
  });
});
