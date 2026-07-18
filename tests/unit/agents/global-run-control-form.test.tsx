// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalRunControlForm } from "@/components/agents/global-run-control-form";

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.apiRequest.mockReset();
  mocks.refresh.mockReset();
});

describe("global run controls", () => {
  it("requires a reason and explicit browser confirmation for both broad commands", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.apiRequest.mockResolvedValue({ count: 2 });
    render(<GlobalRunControlForm />);

    const cancel = screen.getByRole("button", { name: "Tüm pending write run’ları iptal et" });
    const stop = screen.getByRole("button", { name: "Tüm active run’lara graceful stop" });
    expect(cancel).toBeDisabled();
    expect(stop).toBeDisabled();

    await userEvent.type(
      screen.getByLabelText("Global run kontrolü gerekçesi"),
      "Kontrollü global queue ve run müdahalesi.",
    );
    await userEvent.click(cancel);
    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenNthCalledWith(
        1,
        "/api/v1/admin/agent-runs/cancel-pending",
        {
          method: "POST",
          body: {
            reason: "Kontrollü global queue ve run müdahalesi.",
            confirmation: "CANCEL_ALL_PENDING_WRITE_RUNS",
          },
          csrf: true,
          idempotency: true,
        },
      ),
    );

    await userEvent.type(
      screen.getByLabelText("Global run kontrolü gerekçesi"),
      "Kontrollü active run graceful stop müdahalesi.",
    );
    await userEvent.click(stop);
    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenNthCalledWith(
        2,
        "/api/v1/admin/agent-runs/graceful-stop",
        {
          method: "POST",
          body: {
            reason: "Kontrollü active run graceful stop müdahalesi.",
            confirmation: "GRACEFULLY_STOP_ALL_ACTIVE_RUNS",
          },
          csrf: true,
          idempotency: true,
        },
      ),
    );
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(2);
  });
});
