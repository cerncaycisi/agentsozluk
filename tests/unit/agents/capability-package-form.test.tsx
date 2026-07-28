// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentCapabilityMeasurementForm } from "@/components/agents/agent-capability-measurement-form";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/lib/http/client", () => ({
  apiRequest: mocks.apiRequest,
  ClientApiError: class ClientApiError extends Error {},
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

const measurement = {
  codexVersion: "codex-cli 2.4.0",
  promptProfileHash: "a".repeat(64),
  benchmarkRunCount: 10,
  p50DurationMs: 120_000,
  p75DurationMs: 180_000,
  p95DurationMs: 240_000,
  maxDurationMs: 300_000,
  successfulActionCount: 10,
  proposedEntryActionCount: 8,
  publishedEntries: 0,
  failureRate: 0,
  duplicateRetryRate: 0,
  singleProcessPeakRssMb: 400,
  dualProcessPeakRssMb: null,
  systemPeakMemoryMb: 3000,
  availableMemoryMb: 900,
  swapInMb: 0,
  swapOutMb: 0,
  loadAverage1m: 1,
  dualRunSuccessCount: 0,
  oomDetected: false,
  swapThrashingDetected: false,
  healthStable: true,
  readinessStable: true,
  appLatencyImpact: { baselineP95Ms: 50, measuredP95Ms: 55, stable: true },
  databaseLatencyImpact: { baselineP95Ms: 10, measuredP95Ms: 12, stable: true },
  capacityStatus: "HEALTHY",
};

const documents = {
  cold: measurement,
  warm: { ...measurement, p50DurationMs: 110_000 },
  dual: {
    ...measurement,
    dualProcessPeakRssMb: 700,
    dualRunSuccessCount: 2,
  },
};

describe("capability package form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads the standard three files and submits one atomic package", async () => {
    mocks.apiRequest.mockResolvedValue({
      dualConcurrencySupported: true,
      concurrencyDowngraded: false,
    });
    const user = userEvent.setup();
    render(<AgentCapabilityMeasurementForm />);

    await user.upload(screen.getByLabelText("Ölçüm dosyaları"), [
      new File([JSON.stringify(documents.cold)], "capacity-cold-20260728.json", {
        type: "application/json",
      }),
      new File([JSON.stringify(documents.warm)], "capacity-warm-20260728.json", {
        type: "application/json",
      }),
      new File([JSON.stringify(documents.dual)], "capacity-dual-20260728.json", {
        type: "application/json",
      }),
    ]);

    expect(
      await screen.findByText("Paket hazır — üç ölçümün fingerprint’i eşleşiyor."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Paketi doğrula ve birlikte kaydet" }));
    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenCalledWith(
        "/api/v1/admin/agent-runtime/capability-package",
        expect.objectContaining({
          method: "POST",
          body: documents,
          csrf: true,
          idempotency: true,
        }),
      ),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Cold, warm ve dual ölçümleri birlikte kaydedildi; çift lane doğrulandı.",
    );
  });

  it("rejects a mismatched package before offering the save action", async () => {
    const user = userEvent.setup();
    render(<AgentCapabilityMeasurementForm />);
    await user.upload(
      screen.getByLabelText("Ölçüm dosyaları"),
      new File(
        [
          JSON.stringify({
            ...documents,
            warm: { ...documents.warm, promptProfileHash: "b".repeat(64) },
          }),
        ],
        "capacity-package.json",
        { type: "application/json" },
      ),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/fingerprint/iu);
    expect(
      screen.queryByRole("button", { name: "Paketi doğrula ve birlikte kaydet" }),
    ).not.toBeInTheDocument();
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });
});
