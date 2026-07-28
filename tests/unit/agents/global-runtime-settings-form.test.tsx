// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalRuntimeSettingsForm } from "@/components/agents/global-runtime-settings-form";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/http/client", () => ({
  apiRequest: mocks.apiRequest,
  ClientApiError: class ClientApiError extends Error {},
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

const initial = {
  settingsVersion: 7,
  publicWriteEnabled: true,
  runtimeOperatingMode: "NORMAL" as const,
  sourceFetchLimit: 8,
  circuitBreakerConfig: {
    errorRateWindowMinutes: 30,
    errorRateThreshold: 0.5,
    consecutiveCodexFailures: 3,
    duplicateWindowSize: 20,
    duplicateThreshold: 0.4,
    duplicateCooldownMinutes: 30,
    utilizationWindowMinutes: 120,
    utilizationThreshold: 0.9,
  },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.apiRequest.mockReset();
  mocks.refresh.mockReset();
});

describe("global runtime settings controls", () => {
  it("uses explicit broad-action confirmation and persists the public write kill switch", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.apiRequest.mockResolvedValue({ settingsVersion: 8 });
    render(<GlobalRuntimeSettingsForm initial={initial} />);

    await userEvent.type(
      screen.getByLabelText("Genel ayar değişikliği gerekçesi"),
      "Public write bakım penceresi için durduruluyor.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Genel yazmayı durdur" }));
    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenCalledWith("/api/v1/admin/agent-settings", {
        method: "PATCH",
        body: {
          publicWriteEnabled: false,
          expectedSettingsVersion: 7,
          changeReason: "Public write bakım penceresi için durduruluyor.",
        },
        csrf: true,
        idempotency: true,
      }),
    );
    expect(screen.getByText("DURAKLATILDI / SALT OKUNUR")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Genel yazma durduruldu; salt okunur çalışma sürüyor.",
    );
  });

  it("renders structured source and circuit-breaker controls and submits strict data", async () => {
    mocks.apiRequest.mockResolvedValue({ settingsVersion: 8 });
    render(<GlobalRuntimeSettingsForm initial={initial} />);
    await userEvent.type(
      screen.getByLabelText("Genel ayar değişikliği gerekçesi"),
      "Kaynak ve breaker sınırları ölçüme göre güncelleniyor.",
    );
    await userEvent.clear(screen.getByLabelText("Kaynak okuma üst sınırı"));
    await userEvent.type(screen.getByLabelText("Kaynak okuma üst sınırı"), "5");
    await userEvent.clear(screen.getByLabelText("Ardışık Codex hatası"));
    await userEvent.type(screen.getByLabelText("Ardışık Codex hatası"), "4");
    await userEvent.click(screen.getByRole("button", { name: "Toplum çalışma ayarlarını kaydet" }));

    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenCalledWith("/api/v1/admin/agent-settings", {
        method: "PATCH",
        body: expect.objectContaining({
          sourceFetchLimit: 5,
          circuitBreakerConfig: expect.objectContaining({ consecutiveCodexFailures: 4 }),
        }),
        csrf: true,
        idempotency: true,
      }),
    );
    const submitted = mocks.apiRequest.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(submitted).not.toHaveProperty("publicWriteEnabled");
    expect(submitted).not.toHaveProperty("runtimeOperatingMode");
    expect(submitted).toMatchObject({
      expectedSettingsVersion: 7,
      changeReason: "Kaynak ve breaker sınırları ölçüme göre güncelleniyor.",
    });
  });
});
