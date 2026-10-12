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
      const gerekce = screen.getByLabelText(/Moderasyon gerekçesi/u);
      // Gerekçe hazır gelir (tek tık, 12 Ekim); değiştirilebilir.
      expect(gerekce).toHaveValue("Agent içeriği moderasyonu: yönetici kararı, panelden.");
      await user.clear(gerekce);
      await user.type(gerekce, reason);
      await user.click(screen.getByRole("button", { name: "Bu run’ın tüm entry’lerini gizle" }));
      // Sebebe basmak işlemi uygular; ders metni sebebin kendisidir.
      await user.click(
        screen.getByRole("button", {
          name: "Entry mevcut katkıyı anlamlı yenilik olmadan tekrarlıyor",
        }),
      );
      await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalled());
      expect(mocks.apiRequest.mock.calls[0]?.[1]).toMatchObject({
        body: {
          runId: expect.any(String),
          reason,
          confirmation: "HIDE_AGENT_CONTENT",
          behaviorReasonCode: "REPETITIVE",
          editorNote: "Entry mevcut katkıyı anlamlı yenilik olmadan tekrarlıyor",
        },
      });
      if (status === "NO_MATCH") {
        expect(
          await screen.findByText("Seçime uyan agent içeriği bulunamadı; işlem yapılmadı."),
        ).toBeVisible();
        expect(screen.getByLabelText(/Moderasyon gerekçesi/u)).toHaveValue(reason);
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

  it("sebep penceresinde yeniden deneme aynı idempotency anahtarıyla gider (Sol, 12 Ekim)", async () => {
    mocks.apiRequest.mockRejectedValueOnce(new Error("ağ")).mockResolvedValueOnce({
      status: "SUCCEEDED",
      selectedCount: 1,
      succeeded: [{ entryId: "entry-1" }],
      failed: [],
    });
    const user = userEvent.setup();
    render(<AgentContentModeration rows={[row()]} />);
    await user.click(screen.getByRole("button", { name: "Bu run’ın tüm entry’lerini gizle" }));
    const sebep = "Entry mevcut katkıyı anlamlı yenilik olmadan tekrarlıyor";
    await user.click(screen.getByRole("button", { name: sebep }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: sebep }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(2));
    const anahtar = (i: number) =>
      (mocks.apiRequest.mock.calls[i]?.[1] as { idempotency: unknown }).idempotency;
    expect(typeof anahtar(0)).toBe("string");
    expect(anahtar(1)).toBe(anahtar(0));
  });

  it("geri açmada yeniden deneme aynı anahtarla gider; başarıdan sonra yeni komut olur (Sol, 12 Ekim)", async () => {
    mocks.apiRequest
      .mockRejectedValueOnce(new Error("ağ"))
      .mockResolvedValue({ status: "SUCCEEDED", selectedCount: 1, succeeded: [{}], failed: [] });
    const user = userEvent.setup();
    render(
      <AgentContentModeration rows={[{ ...row(), entry: { ...row().entry, status: "HIDDEN" } }]} />,
    );
    const geriAc = screen.getByRole("button", { name: "Tek entry’yi geri aç" });
    await user.click(geriAc);
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(1));
    await user.click(geriAc);
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(2));
    await user.click(geriAc);
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(3));
    const anahtar = (i: number) =>
      (mocks.apiRequest.mock.calls[i]?.[1] as { idempotency: unknown }).idempotency;
    expect(anahtar(1)).toBe(anahtar(0));
    expect(anahtar(2)).not.toBe(anahtar(1));
  });

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
