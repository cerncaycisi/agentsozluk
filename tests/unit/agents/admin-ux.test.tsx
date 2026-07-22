// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentLifecycleForm,
  AgentPersonaEditForm,
  AgentQuickRunActions,
  PersonaRollbackForm,
} from "@/components/agents/agent-admin-forms";
import { AgentDetailNavigation } from "@/components/agents/agent-detail-navigation";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { seedPersonaPackSchema } from "@/modules/agents/personas/schema";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));
vi.mock("@/lib/http/client", () => ({
  apiRequest: mocks.apiRequest,
  ClientApiError: class ClientApiError extends Error {},
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

const agentId = "00000000-0000-4000-8000-000000000101";
const persona = seedPersonaPackSchema.parse(originalPersonaPack).personas[0]!;
const profile = {
  useGlobalEntryQuota: true,
  dailyEntryMin: null,
  dailyEntryMax: null,
  dailyTopicMin: 0,
  dailyTopicMax: 2,
  dailyVoteMin: 0,
  dailyVoteMax: 10,
  activeTimeProfile: {
    "07:00-10:00": 0.15,
    "10:00-14:00": 0.3,
    "14:00-19:00": 0.35,
    "19:00-23:00": 0.17,
    "23:00-07:00": 0.03,
  },
  personaEvolutionEnabled: true,
  sourceEvolutionEnabled: true,
  scheduledTimeoutSeconds: 360,
  manualTimeoutSeconds: 600,
};

const preview = {
  runCount: 1,
  existingQueueLength: 0,
  measuredP75DurationMs: 1200,
  estimateStatus: "ESTIMATED" as const,
  estimatedStartAt: "2026-07-18T12:00:00.000Z",
  estimatedCompleteAt: "2026-07-18T12:01:00.000Z",
  estimatedScheduledDelayMs: 0,
  targetMissRiskChange: {
    estimateStatus: "ESTIMATED" as const,
    beforeProjectedShortfallEntries: 3,
    afterProjectedShortfallEntries: 3,
    deltaProjectedShortfallEntries: 0,
    direction: "UNCHANGED" as const,
  },
  workerUtilization: 0.25,
  concurrency: 1,
  saturationOverride: false,
  dailyMaximumOverride: false,
  provocationOverride: false,
};

describe("agent admin UX contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("previews and confirms a quick dry run with the accessible agent-specific action", async () => {
    mocks.apiRequest.mockResolvedValueOnce(preview).mockResolvedValueOnce({ count: 1 });
    const user = userEvent.setup();
    render(<AgentQuickRunActions agentId={agentId} username="katmanizci" />);

    expect(screen.getByRole("button", { name: "Şimdi çalıştır @katmanizci" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reflection @katmanizci" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Source refresh @katmanizci" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Dry run @katmanizci" }));
    expect(screen.getByRole("dialog", { name: "@katmanizci agent çalıştır" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Kapasite önizle" }));

    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenNthCalledWith(
        1,
        "/api/v1/admin/agent-runs/bulk/preview",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({
            agentIds: [agentId],
            run: expect.objectContaining({ runType: "DRY_RUN", entryTarget: 0 }),
          }),
        }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "Onayla ve kuyruğa al" }));
    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenNthCalledWith(
        2,
        `/api/v1/admin/agents/${agentId}/runs`,
        expect.objectContaining({
          body: expect.objectContaining({ runType: "DRY_RUN", entryTarget: 0 }),
        }),
      ),
    );
  });

  it("keeps full JSON out of the default edit surface and sends structured persona/profile fields", async () => {
    mocks.apiRequest.mockResolvedValue({});
    const user = userEvent.setup();
    render(<AgentPersonaEditForm agentId={agentId} persona={persona} profile={profile} />);

    expect(screen.getByLabelText(/Kullanıcı adı/u)).toBeDisabled();
    expect(screen.queryByLabelText(/Persona JSON\/YAML/u)).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Değerler ve ilgi alanları" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Kaynaklar" })).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Mizaç" }));
    const curiosity = screen.getByLabelText("Merak");
    await user.clear(curiosity);
    await user.type(curiosity, "0.88");
    await user.type(
      screen.getByLabelText("Persona değişiklik özeti"),
      "Merak ağırlığını kontrollü olarak güncelledim.",
    );
    await user.click(screen.getByRole("button", { name: "Yeni persona sürümü oluştur" }));

    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenCalledWith(
        `/api/v1/admin/agents/${agentId}`,
        expect.objectContaining({
          method: "PATCH",
          body: expect.objectContaining({
            persona: expect.objectContaining({
              username: persona.username,
              temperament: expect.objectContaining({ curiosity: 0.88 }),
            }),
            changeSummary: "Merak ağırlığını kontrollü olarak güncelledim.",
          }),
        }),
      ),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Yeni persona sürümü oluşturuldu.");

    await user.click(screen.getByRole("tab", { name: "Gelişmiş" }));
    expect(screen.getByLabelText("Persona JSON/YAML (JSON)")).toBeVisible();
  });

  it("confirms persona rollback with visible success feedback", async () => {
    mocks.apiRequest.mockResolvedValue({ version: 4 });
    const user = userEvent.setup();
    render(<PersonaRollbackForm agentId={agentId} versions={[3, 2, 1]} />);

    await user.type(
      screen.getByLabelText("Rollback gerekçesi"),
      "Önceki güvenli persona davranışına kontrollü dönüş.",
    );
    await user.click(screen.getByRole("button", { name: "Yeni sürüm olarak rollback" }));

    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenCalledWith(
        `/api/v1/admin/agents/${agentId}/persona/rollback`,
        expect.objectContaining({
          method: "POST",
          body: {
            version: 3,
            reason: "Önceki güvenli persona davranışına kontrollü dönüş.",
          },
        }),
      ),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Persona v3 temel alınarak yeni rollback sürümü oluşturuldu.",
    );
  });

  it("refreshes lifecycle transition options when the server prop changes", async () => {
    const { rerender } = render(<AgentLifecycleForm agentId={agentId} current="ACTIVE" />);
    expect(screen.getByLabelText("Yeni durum")).toHaveValue("PAUSED");

    rerender(<AgentLifecycleForm agentId={agentId} current="PAUSED" />);
    await waitFor(() => expect(screen.getByLabelText("Yeni durum")).toHaveValue("ACTIVE"));
  });

  it("exposes the real detail destinations without retired daily scheduling", () => {
    render(<AgentDetailNavigation agentId={agentId} />);
    const navigation = screen.getByRole("navigation", { name: "Agent detay bölümleri" });
    expect(navigation).toBeVisible();
    const base = `/moderasyon/agentlar/${agentId}`;
    const destinations = {
      Genel: `${base}#genel`,
      Persona: `${base}/duzenle#persona`,
      "İlgi ve kanaatler": `${base}#ilgi-ve-kanaatler`,
      Kaynaklar: `${base}#kaynaklar`,
      Hafıza: `${base}/hafiza`,
      İlişkiler: `${base}#iliskiler`,
      "Entry ve topic’ler": `/moderasyon/agent-icerikleri?agentProfileId=${agentId}`,
      "Oylar ve takipler": `${base}#oylar-ve-takipler`,
      Çalışmalar: `${base}/calismalar`,
      Audit: "/moderasyon/audit",
      Kontroller: `${base}#kontroller`,
    };
    for (const [label, href] of Object.entries(destinations))
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
  });
});
