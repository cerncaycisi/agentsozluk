// @vitest-environment jsdom

import userEvent from "@testing-library/user-event";
import type * as HttpClient from "@/lib/http/client";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentContentModeration,
  type AgentContentModerationRow,
} from "@/components/agents/agent-content-moderation";

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn(), info: vi.fn(), success: vi.fn() }));
vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof HttpClient>()),
  apiRequest: mocks.apiRequest,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, info: mocks.info, warning: vi.fn(), error: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function row(overrides: Partial<AgentContentModerationRow["run"]> = {}) {
  return {
    id: "record-1",
    createdAt: "2026-07-18T10:00:00.000Z",
    entry: {
      id: "entry-1",
      publicId: 21,
      body: "Override kaynağı dashboard satırında görünür kalmalıdır.",
      status: "ACTIVE",
      createdAt: "2026-07-18T10:00:00.000Z",
      topic: {
        id: "topic-1",
        publicId: 12,
        title: "Override görünürlüğü",
        slug: "override-gorunurlugu",
      },
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
      provocationOverride: false,
      ...overrides,
    },
    action: { id: "action-1", provenance: { evidenceType: "PLATFORM_EVENT" } },
    reports: [],
    topicWriteLock: null,
  } satisfies AgentContentModerationRow;
}

describe("agent content override badges", () => {
  it.each(["NO_MATCH", "SUCCEEDED"])(
    "shows truthful scope for a %s bulk result",
    async (status) => {
      mocks.apiRequest.mockResolvedValue({
        status,
        selectedCount: status === "NO_MATCH" ? 0 : 1,
        succeeded: status === "NO_MATCH" ? [] : [{ entryId: "entry-1" }],
        failed: [],
        selection: { resolvedAt: "2026-10-04T10:00:00.000Z", runStatus: "RUNNING" },
      });
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const user = userEvent.setup();
      render(<AgentContentModeration rows={[row({ runStatus: "RUNNING" })]} />);
      const reason = "Seçim sonucunun kapsamı kullanıcıya açık gösterilmelidir.";
      await user.type(screen.getByLabelText("Moderasyon gerekçesi"), reason);
      await user.selectOptions(screen.getByLabelText("Davranış sebebi"), "REPETITIVE");
      await user.type(
        screen.getByLabelText("Agent’ın özümseyeceği kısa ders"),
        "Katkıyı tekrarlama.",
      );
      await user.click(screen.getByRole("button", { name: "Bu run’ın tüm entry’lerini gizle" }));
      await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalled());
      if (status === "NO_MATCH") {
        expect(
          await screen.findByText("Seçime uyan agent içeriği bulunamadı; işlem yapılmadı."),
        ).toBeVisible();
        expect(screen.getByLabelText("Moderasyon gerekçesi")).toHaveValue(reason);
        expect(screen.queryByText(/0\/0 başarılı/u)).not.toBeInTheDocument();
        expect(mocks.success).not.toHaveBeenCalled();
      } else {
        expect(
          await screen.findByText(/Sonradan üretilen içerikler dahil değildir/u),
        ).toBeVisible();
        expect(screen.getByText(/Seçim sırasında koşu devam ediyordu/u)).toBeVisible();
      }
    },
  );

  it("shows only the still-supported provocation override", () => {
    render(
      <AgentContentModeration
        rows={[
          row({
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
