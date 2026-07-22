// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AgentContentModeration,
  type AgentContentModerationRow,
} from "@/components/agents/agent-content-moderation";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

afterEach(cleanup);

function row(overrides: Partial<AgentContentModerationRow["run"]> = {}) {
  return {
    id: "record-1",
    createdAt: "2026-07-18T10:00:00.000Z",
    entry: {
      id: "entry-1",
      body: "Override kaynağı dashboard satırında görünür kalmalıdır.",
      status: "ACTIVE",
      createdAt: "2026-07-18T10:00:00.000Z",
      topic: { id: "topic-1", title: "Override görünürlüğü", slug: "override-gorunurlugu" },
    },
    agentProfile: {
      id: "agent-1",
      user: { username: "override_agent", displayName: "Override Agent" },
    },
    run: {
      id: "run-1",
      runType: "MANUAL",
      runStatus: "SUCCEEDED",
      createdAt: "2026-07-18T10:00:00.000Z",
      dailyMaximumOverride: false,
      saturationOverride: false,
      provocationOverride: false,
      ...overrides,
    },
    action: { id: "action-1", provenance: { evidenceType: "PLATFORM_EVENT" } },
    reports: [],
    topicWriteLock: null,
  } satisfies AgentContentModerationRow;
}

describe("agent content override badges", () => {
  it("shows only the still-supported provocation override", () => {
    render(
      <AgentContentModeration
        rows={[
          row({
            dailyMaximumOverride: true,
            saturationOverride: true,
            provocationOverride: true,
          }),
        ]}
      />,
    );

    const badges = screen.getByLabelText("Run override’ları");
    expect(badges).not.toHaveTextContent("DAILY MAXIMUM OVERRIDE");
    expect(badges).not.toHaveTextContent("SATURATION OVERRIDE");
    expect(badges).toHaveTextContent("PROVOCATION OVERRIDE");
  });

  it("does not label a run when every override is disabled", () => {
    render(<AgentContentModeration rows={[row()]} />);

    expect(screen.queryByLabelText("Run override’ları")).not.toBeInTheDocument();
  });

  it("exposes scoped takedown and agent runtime controls with accessible names", () => {
    render(
      <AgentContentModeration
        rows={[row()]}
        agents={[
          {
            id: "agent-1",
            lifecycleStatus: "ACTIVE",
            user: { username: "override_agent", displayName: "Override Agent" },
            currentRun: { id: "active-run-1", runStatus: "RUNNING" },
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "Tek entry’yi gizle" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bu run’ın tüm entry’lerini gizle" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bu agent’ın son X saatini gizle" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agent’ı pause et" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pending write run’larını iptal et" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aktif run’ı durdur" })).toBeInTheDocument();
    expect(screen.getByLabelText("Agent pencere süresi")).toHaveValue(24);
  });
});
