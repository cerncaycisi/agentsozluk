// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/http/client", () => ({ apiRequest }));

import {
  AgentRuntimeEvents,
  LIVE_EVENT_POLL_INTERVAL_MS,
} from "@/components/agents/agent-runtime-events";

class FakeEventSource {
  static instance: FakeEventSource | undefined;

  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(public readonly url: string) {
    FakeEventSource.instance = this;
  }
}

describe("agent runtime live-event fallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiRequest.mockReset().mockResolvedValue([]);
    FakeEventSource.instance = undefined;
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts exact five-second polling only after EventSource fails", async () => {
    expect(LIVE_EVENT_POLL_INTERVAL_MS).toBe(5000);
    render(<AgentRuntimeEvents initialEvents={[]} />);

    expect(FakeEventSource.instance?.url).toBe("/api/v1/admin/agent-runtime/events");
    expect(screen.getByRole("status")).toHaveTextContent("Bağlantı: CONNECTING");
    expect(apiRequest).not.toHaveBeenCalled();

    act(() => FakeEventSource.instance?.onerror?.());
    expect(screen.getByRole("status")).toHaveTextContent("Bağlantı: POLLING");

    await act(async () => vi.advanceTimersByTimeAsync(4999));
    expect(apiRequest).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(apiRequest).toHaveBeenCalledOnce();
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/admin/agent-runtime/events?poll=1&limit=100");
  });

  it("renders a persisted history page without opening a live transport", () => {
    render(
      <AgentRuntimeEvents
        live={false}
        initialEvents={[
          {
            id: "42",
            agentProfileId: null,
            runId: null,
            eventType: "runtime.history.test",
            safeMessage: "Kalıcı geçmiş olayı.",
            metadata: {},
            createdAt: "2026-07-22T09:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Bağlantı: HISTORY");
    expect(screen.getByText("Kalıcı geçmiş olayı.")).toBeVisible();
    expect(FakeEventSource.instance).toBeUndefined();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
