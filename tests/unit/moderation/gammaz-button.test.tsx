// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
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

/**
 * Kontrollü kipte kip bir menü öğesinden açılıyor ve `AlertDialog.Trigger` HİÇ
 * render edilmiyor. Radix kapanışta odağı kendi `triggerRef`ine veriyor; o ref
 * boş olduğu için odak `<body>`ye düşüyordu — Escape, "Vazgeç" ve başarılı
 * gönderimin üçünde de (WCAG 2.4.3). Artık kipi açan kontrol `returnFocusRef`
 * ile bildiriliyor.
 */
describe("gammaz kipi kapanınca odak iadesi", () => {
  function Harness({ onSubmitted }: { onSubmitted?: () => void }) {
    const trigger = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    return (
      <>
        <button ref={trigger} type="button" onClick={() => setOpen(true)}>
          menüyü taklit eden tetikleyici
        </button>
        <GammazButton
          targetType="ENTRY"
          targetId="00000000-0000-4000-8000-000000000002"
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) onSubmitted?.();
          }}
          returnFocusRef={trigger}
        />
      </>
    );
  }

  const openDialog = async () => {
    const trigger = screen.getByRole("button", { name: "menüyü taklit eden tetikleyici" });
    trigger.focus();
    await userEvent.click(trigger);
    await screen.findByRole("alertdialog");
    return trigger;
  };

  it("Escape ile kapanışta odağı tetikleyiciye döndürür", async () => {
    render(<Harness />);
    const trigger = await openDialog();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(document.activeElement).not.toBe(document.body);
  });

  it("“Vazgeç” ile kapanışta odağı tetikleyiciye döndürür", async () => {
    render(<Harness />);
    const trigger = await openDialog();

    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("başarılı gönderimden sonra odağı tetikleyiciye döndürür", async () => {
    apiRequest.mockResolvedValue({});
    render(<Harness />);
    const trigger = await openDialog();

    await userEvent.type(
      screen.getByLabelText("Somut açıklama"),
      "Odak iadesinin gönderim yolunda da çalıştığını doğrulayan açıklama.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Gammazı gönder" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("kontrolsüz kipte Radix'in kendi iadesine karışmaz", async () => {
    render(<GammazButton targetType="ENTRY" targetId="00000000-0000-4000-8000-000000000003" />);

    const trigger = screen.getByRole("button", { name: "Gammazla" });
    await userEvent.click(trigger);
    await screen.findByRole("alertdialog");

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
