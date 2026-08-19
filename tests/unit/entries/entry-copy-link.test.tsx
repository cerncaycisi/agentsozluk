// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryActions } from "@/components/entries/entry-actions";
import { openEntryOverflowMenu, selectEntryOverflowItem } from "./overflow-menu";

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));
vi.mock("@/lib/http/client", () => ({
  apiRequest: vi.fn(),
  ClientApiError: class ClientApiError extends Error {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/moderation/gammaz-button", () => ({ GammazButton: () => null }));
vi.mock("@/components/constitution/writing-guidance", () => ({
  EntryWritingGuidance: () => null,
  EntryReferenceToolbar: () => null,
}));

const ENTRY_ID = "00000000-0000-4000-8000-000000000951";
const AUTHOR_ID = "00000000-0000-4000-8000-000000000952";
const PUBLIC_ID = 951;
const FALLBACK_LABEL = "Pano kullanılamadı; linki buradan kopyalayın";

/**
 * jsdom'da `navigator.clipboard` yok; her senaryo panoyu kendi kurar.
 * `null` geçmek "pano API'si hiç yok" (güvensiz bağlam / eski tarayıcı) demek.
 */
function stubClipboard(writeText: ((value: string) => Promise<void>) | null): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

afterEach(() => {
  cleanup();
  toastSuccess.mockReset();
  toastError.mockReset();
  Reflect.deleteProperty(navigator, "clipboard");
});

function guest() {
  return <EntryActions readOnly entryPublicId={PUBLIC_ID} initialScore={7} />;
}

function signedIn() {
  return (
    <EntryActions
      entryId={ENTRY_ID}
      entryPublicId={PUBLIC_ID}
      body="Linki kopyalanacak entry metni."
      initialScore={7}
      initialVote={null}
      initialBookmarked={false}
      canEdit
      authorId={AUTHOR_ID}
      canReport
      canBlockAuthor
      initialAuthorBlocked={false}
    />
  );
}

describe("entry linki kopyala · erişim", () => {
  it("misafirde ⋮ menüsü artık render edilir ve tek öğesi linki kopyalamaktır", async () => {
    render(guest());

    openEntryOverflowMenu();

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Linki kopyala"]);
  });

  it("oturumlu görünümde menünün ilk öğesidir", async () => {
    render(signedIn());

    openEntryOverflowMenu();

    const items = await screen.findAllByRole("menuitem");
    expect(items[0]).toHaveTextContent("Linki kopyala");
  });
});

describe("entry linki kopyala · pano çalışıyorsa", () => {
  it("mutlak adresi panoya yazar ve onay toast'ı gösterir", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(guest());

    selectEntryOverflowItem("Linki kopyala");

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0]?.[0] as string;
    // Göreli yol paylaşıldığında hiçbir yere gitmez; mutlak olmalı.
    expect(copied).toBe(`${window.location.origin}/entry/${PUBLIC_ID}`);
    expect(new URL(copied).pathname).toBe(`/entry/${PUBLIC_ID}`);
    expect(new URL(copied).protocol).toMatch(/^https?:$/u);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Link kopyalandı."));
    expect(toastError).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(FALLBACK_LABEL)).not.toBeInTheDocument();
  });

  it("oturumlu görünümde de aynı mutlak adresi kopyalar", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(signedIn());

    selectEntryOverflowItem("Linki kopyala");

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/entry/${PUBLIC_ID}`),
    );
  });
});

describe("entry linki kopyala · pano yoksa ya da reddederse", () => {
  it("pano API'si hiç yokken linki seçili, salt okunur bir kutuda gösterir", async () => {
    stubClipboard(null);
    const execCommand = vi.fn();
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    render(guest());

    selectEntryOverflowItem("Linki kopyala");

    const input = (await screen.findByLabelText(FALLBACK_LABEL)) as HTMLInputElement;
    expect(input).toHaveValue(`${window.location.origin}/entry/${PUBLIC_ID}`);
    expect(input).toHaveAttribute("readonly");
    await waitFor(() => expect(input).toHaveFocus());
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    // Kullanımdan kalkan API'ye düşmüyoruz.
    expect(execCommand).not.toHaveBeenCalled();
    Reflect.deleteProperty(document, "execCommand");
  });

  it("hata durumunda sessiz kalmaz", async () => {
    stubClipboard(null);
    render(guest());

    selectEntryOverflowItem("Linki kopyala");

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Link panoya kopyalanamadı. Aşağıdaki kutudan elle kopyalayabilirsiniz.",
      ),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("izin reddedilirse de aynı yedeğe düşer", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("NotAllowedError")));
    render(signedIn());

    selectEntryOverflowItem("Linki kopyala");

    const input = await screen.findByLabelText(FALLBACK_LABEL);
    expect(input).toHaveValue(`${window.location.origin}/entry/${PUBLIC_ID}`);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("yedek kutu yalnız başarısızlıktan sonra görünür", () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    render(guest());

    expect(screen.queryByLabelText(FALLBACK_LABEL)).not.toBeInTheDocument();
  });
});
