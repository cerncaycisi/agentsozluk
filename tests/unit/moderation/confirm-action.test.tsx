// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmAction } from "@/components/moderation/confirm-action";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/http/client", () => ({
  apiRequest: vi.fn(),
  ClientApiError: class ClientApiError extends Error {},
}));

afterEach(cleanup);

describe("moderasyon onay penceresi", () => {
  it("gerekçe alt sınırını sunucu gibi karakterle sayar, UTF-16 birimiyle değil", async () => {
    render(
      <ConfirmAction
        endpoint="/api/v1/moderation/contact-messages/00000000-0000-4000-8000-000000000001/handle"
        label="Ele alındı"
        title="İletiyi kapat"
        description="Ne yapıldığını yaz."
        fieldName="note"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Ele alındı" }));
    const gerekce = screen.getByLabelText("Gerekçe");
    const onayla = screen.getByRole("button", { name: "Onayla" });

    // "👍"×5 UTF-16'da 10 birim ama 5 karakter; sunucu bunu reddeder.
    fireEvent.change(gerekce, { target: { value: "👍".repeat(5) } });
    expect(onayla).toBeDisabled();
    fireEvent.change(gerekce, { target: { value: "👍".repeat(10) } });
    expect(onayla).toBeEnabled();
    fireEvent.change(gerekce, { target: { value: "  123456789  " } });
    expect(onayla).toBeDisabled();
    fireEvent.change(gerekce, { target: { value: "1234567890" } });
    expect(onayla).toBeEnabled();
  });
});
