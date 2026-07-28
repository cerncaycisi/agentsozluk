// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GammazButton } from "@/components/moderation/gammaz-button";

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/http/client", () => ({
  apiRequest,
  ClientApiError: class ClientApiError extends Error {},
}));

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe("gammaz button", () => {
  it("submits the selected entry reason with only its required evidence", async () => {
    apiRequest.mockResolvedValue({});
    render(
      <GammazButton targetType="ENTRY" targetId="00000000-0000-4000-8000-000000000001" compact />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Entry’yi gammazla" }));
    await userEvent.selectOptions(screen.getByLabelText("Gerekçe"), "GAMMAZ_8_DUPLICATE_ENTRY");
    await userEvent.type(screen.getByLabelText("Önceki entry numarası"), "519");
    await userEvent.type(
      screen.getByLabelText("Somut açıklama"),
      "Bu entry daha önce yazılmış olan açıklamayı tekrar ediyor.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Gammazı gönder" }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/api/v1/reports", {
        method: "POST",
        body: {
          targetType: "ENTRY",
          targetId: "00000000-0000-4000-8000-000000000001",
          reason: "GAMMAZ_8_DUPLICATE_ENTRY",
          details: "Bu entry daha önce yazılmış olan açıklamayı tekrar ediyor.",
          evidence: { duplicateEntryPublicId: 519 },
        },
        csrf: true,
        idempotency: true,
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Gammaz moderasyon kuyruğuna gönderildi.");
  });

  it("offers topic canonicalization instead of entry-only reasons", async () => {
    render(<GammazButton targetType="TOPIC" targetId="00000000-0000-4000-8000-000000000002" />);
    await userEvent.click(screen.getByRole("button", { name: "Gammazla" }));
    const reason = screen.getByLabelText("Gerekçe");
    expect(reason).toHaveTextContent("Başlık · kanonik adres düzeltme talebi");
    expect(reason).not.toHaveTextContent("fiziksel referans");
  });
});
