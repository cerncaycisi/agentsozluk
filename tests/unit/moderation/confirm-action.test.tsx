// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmAction } from "@/components/moderation/confirm-action";
import { apiRequest } from "@/lib/http/client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/http/client", () => ({
  apiRequest: vi.fn(),
  ClientApiError: class ClientApiError extends Error {},
}));

afterEach(() => {
  cleanup();
  vi.mocked(apiRequest).mockReset();
});

const ENDPOINT = "/api/v1/moderation/contact-messages/00000000-0000-4000-8000-000000000001/handle";

describe("moderasyon onay penceresi", () => {
  it("geri alınamaz işlemde gerekçe hazır gelir; alt sınırı sunucu gibi karakterle sayar", async () => {
    render(
      <ConfirmAction
        endpoint={ENDPOINT}
        label="Ele alındı"
        title="İletiyi kapat"
        description="Ne yapıldığını yaz."
        fieldName="note"
        irreversible
        defaultReason="İleti okundu ve ele alındı."
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Ele alındı" }));
    const gerekce = screen.getByLabelText(/Gerekçe/u);
    const onayla = screen.getByRole("button", { name: "Onayla" });
    expect(gerekce).toHaveValue("İleti okundu ve ele alındı.");
    expect(onayla).toBeEnabled();

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

  it("geri alınabilir işlem tek tıkla, hazır gerekçeyle uygulanır (Gökhan, 12 Ekim)", async () => {
    vi.mocked(apiRequest).mockResolvedValue({});
    render(
      <ConfirmAction
        endpoint="/api/v1/moderation/users/00000000-0000-4000-8000-000000000002/suspend"
        label="Askıya al"
        title="Kullanıcıyı askıya al"
        description="Oturumlar kapanır."
        destructive
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Askıya al" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/moderation/users/00000000-0000-4000-8000-000000000002/suspend",
      expect.objectContaining({
        method: "POST",
        body: { reason: "Kullanıcıyı askıya al: yönetici kararı, panelden." },
        csrf: true,
        idempotency: true,
      }),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("davranış dersi isteyen işlemde sebebe basmak işlemi uygular; ders metni sebebin kendisidir", async () => {
    vi.mocked(apiRequest).mockResolvedValue({});
    render(
      <ConfirmAction
        endpoint="/api/v1/moderation/topics/00000000-0000-4000-8000-000000000003/hide"
        label="Gizle"
        title="Başlığı gizle"
        description="Başlık akışlardan kalkar."
        destructive
        behaviorFeedback
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Gizle" }));
    await userEvent.click(
      screen.getByRole("button", {
        name: "Entry mevcut katkıyı anlamlı yenilik olmadan tekrarlıyor",
      }),
    );
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiRequest).mock.calls[0]?.[1]).toMatchObject({
      body: {
        reason: "Başlığı gizle: yönetici kararı, panelden.",
        behaviorReasonCode: "REPETITIVE",
        editorNote: "Entry mevcut katkıyı anlamlı yenilik olmadan tekrarlıyor",
      },
    });
  });
});
