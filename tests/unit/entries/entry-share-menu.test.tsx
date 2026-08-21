// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryActions } from "@/components/entries/entry-actions";
import { entryAiSharePrompt } from "@/components/share/share-links";
import { openEntryShareMenu, selectEntryShareItem } from "./overflow-menu";

/**
 * Entry seviyesinde paylaşım. Eskiden burada yalnız "Linki kopyala" vardı ve o
 * da `⋮`'nin içindeydi; iki kıyas ürünü de paylaşımı kendi ikonunun arkasına
 * koyuyor (`docs/BENCHMARK_GIRISLI_2026-08-20.md` §2).
 */

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
const LINK_FALLBACK_LABEL = "Pano kullanılamadı; linki buradan kopyalayın";
const NUMBER_FALLBACK_LABEL = "Pano kullanılamadı; entry numarasını buradan kopyalayın";

function entryUrl(): string {
  return `${window.location.origin}/entry/${PUBLIC_ID}`;
}

/** jsdom'da `navigator.clipboard` yok; `null` = pano API'si hiç yok. */
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

function signedIn(overrides: { canEdit?: boolean; canReport?: boolean } = {}) {
  return (
    <EntryActions
      entryId={ENTRY_ID}
      entryPublicId={PUBLIC_ID}
      body="Paylaşılacak entry metni."
      initialScore={7}
      initialVote={null}
      initialBookmarked={false}
      canEdit
      authorId={AUTHOR_ID}
      canReport
      canBlockAuthor
      initialAuthorBlocked={false}
      {...overrides}
    />
  );
}

const EXPECTED_ITEMS = [
  "ChatGPT",
  "Claude",
  "Perplexity",
  "Grok",
  "X",
  "Facebook",
  "WhatsApp",
  "Linki kopyala",
  "Entry numarasını kopyala",
];

describe("entry paylaşımı · afordans", () => {
  it("şeritte kendi ikonu var ve o ikon KUTUSUZ", () => {
    render(signedIn());

    const trigger = screen.getByRole("button", { name: "Entry’yi paylaş" });
    // Bu bir içerik satırı: kutu, `76c525d`'de kazanılan mürekkep düşüşünü geri verirdi.
    expect(trigger.className).toBe("icon-button");
    expect(trigger.className).not.toContain("icon-button-boxed");
  });

  it("misafirde de var — paylaşım oturum istemiyor", () => {
    render(guest());

    expect(screen.getByRole("button", { name: "Entry’yi paylaş" })).toBeVisible();
  });

  it("misafirde ve oturumda birebir aynı listeyi verir", async () => {
    render(guest());
    openEntryShareMenu();
    const guestItems = (await screen.findAllByRole("menuitem")).map((item) => item.textContent);
    cleanup();

    render(signedIn());
    openEntryShareMenu();
    const signedInItems = (await screen.findAllByRole("menuitem")).map((item) => item.textContent);

    expect(guestItems).toEqual(EXPECTED_ITEMS);
    expect(signedInItems).toEqual(EXPECTED_ITEMS);
  });

  it("yapay zekâ grubu üstte ve entry'ye özel prompt'u taşır", async () => {
    render(signedIn());
    openEntryShareMenu();

    const aiGroup = await screen.findByRole("group", { name: "Yapay zekâya sor" });
    const channels = [...aiGroup.querySelectorAll("a")];
    expect(channels.map((channel) => channel.textContent)).toEqual([
      "ChatGPT",
      "Claude",
      "Perplexity",
      "Grok",
    ]);
    for (const channel of channels) {
      const query = new URL(channel.getAttribute("href") ?? "").searchParams;
      expect(query.get("q") ?? query.get("text")).toBe(entryAiSharePrompt({ url: entryUrl() }));
    }
  });

  it("sosyal kanallara MUTLAK adresi verir; entry gövdesini metin olarak göndermez", async () => {
    render(signedIn());
    openEntryShareMenu();

    const socialGroup = await screen.findByRole("group", { name: "Sosyal ağlarda paylaş" });
    const channels = [...socialGroup.querySelectorAll("a")];
    expect(channels.map((channel) => channel.textContent)).toEqual(["X", "Facebook", "WhatsApp"]);
    for (const channel of channels) {
      const href = channel.getAttribute("href") ?? "";
      expect(href).toContain(encodeURIComponent(entryUrl()));
      expect(new URL(href).protocol).toBe("https:");
    }
    // Yazarın cümlesini onun adına budayıp bir tweet'e koymuyoruz.
    const x = new URL(screen.getByRole("menuitem", { name: "X" }).getAttribute("href") ?? "");
    expect(x.searchParams.has("text")).toBe(false);
  });

  it("kanalların hepsi düz bağlantı; hiçbir harici script yüklenmiyor", async () => {
    const { container } = render(guest());
    openEntryShareMenu();

    const links = (await screen.findAllByRole("menuitem")).filter((item) => item.tagName === "A");
    expect(links).toHaveLength(7);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "nofollow noopener noreferrer");
    }
    expect(container.querySelector("script")).toBeNull();
    expect(document.querySelectorAll("script[src]")).toHaveLength(0);
  });

  it("klavyeyle gezilir, Esc kapatır ve odağı paylaşım ikonuna döndürür", async () => {
    const user = userEvent.setup();
    render(signedIn());

    const trigger = screen.getByRole("button", { name: "Entry’yi paylaş" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const items = await screen.findAllByRole("menuitem");
    await waitFor(() => expect(items[0]).toHaveFocus());
    // Tek eksen: alt menü yok, ayraçlar gezinmeyi bölmüyor. Dördüncüden
    // (Grok, AI grubunun sonu) beşinciye (X, sosyalin başı) düz geçiliyor.
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(items[4]).toHaveFocus();
    await user.keyboard("{End}");
    expect(items[items.length - 1]).toHaveFocus();
    expect(items[items.length - 1]).toHaveTextContent("Entry numarasını kopyala");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menuitem")).toBeNull());
    expect(trigger).toHaveFocus();
  });
});

describe("entry paylaşımı · linki kopyala", () => {
  it("mutlak adresi panoya yazar ve onaylar", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(guest());

    selectEntryShareItem("Linki kopyala");

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0]?.[0] as string;
    // Göreli yol paylaşıldığında hiçbir yere gitmez; mutlak olmalı.
    expect(copied).toBe(entryUrl());
    expect(new URL(copied).pathname).toBe(`/entry/${PUBLIC_ID}`);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Link kopyalandı."));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("pano API'si hiç yokken linki seçili, salt okunur bir kutuda gösterir", async () => {
    stubClipboard(null);
    const execCommand = vi.fn();
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    render(guest());

    selectEntryShareItem("Linki kopyala");

    const input = (await screen.findByLabelText(LINK_FALLBACK_LABEL)) as HTMLInputElement;
    expect(input).toHaveValue(entryUrl());
    expect(input).toHaveAttribute("readonly");
    await waitFor(() => expect(input).toHaveFocus());
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    // Kullanımdan kalkan API'ye düşmüyoruz.
    expect(execCommand).not.toHaveBeenCalled();
    Reflect.deleteProperty(document, "execCommand");
  });

  it("izin reddedilirse de aynı yedeğe düşer ve sessiz kalmaz", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("NotAllowedError")));
    render(signedIn());

    selectEntryShareItem("Linki kopyala");

    expect(await screen.findByLabelText(LINK_FALLBACK_LABEL)).toHaveValue(entryUrl());
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Link panoya kopyalanamadı. Aşağıdaki kutudan elle kopyalayabilirsiniz.",
      ),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("yedek kutu yalnız başarısızlıktan sonra görünür", () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    render(guest());

    expect(screen.queryByLabelText(LINK_FALLBACK_LABEL)).not.toBeInTheDocument();
  });
});

/**
 * Entry numarası. İki kıyas ürünü de kararlı entry kimliğini yüzeye çıkarıyor
 * (ekşi "entry no kopyala", Normal Sözlük hover'da `#868145`); bizde `publicId`
 * vardı ama hiç görünmüyordu.
 *
 * Panoya ÇIPLAK sayı gidiyor: sözlüğün entry referansı `(bkz: #123)` ve
 * composer araç çubuğundaki "Entry" düğmesi o sarmalayıcıyı zaten yazıyor
 * (`writing-guidance.tsx`), imleci de arasına koyuyor. Kopyalanan değer tam o
 * imlece yapıştırılacak parça.
 */
describe("entry paylaşımı · entry numarasını kopyala", () => {
  it("çıplak sayıyı yazar — `#` ya da `(bkz: …)` sarmalayıcısı eklemez", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(guest());

    selectEntryShareItem("Entry numarasını kopyala");

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("951"));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Entry numarası kopyalandı."));
  });

  it("pano yoksa numarayı kendi etiketli yedek kutusunda gösterir", async () => {
    stubClipboard(null);
    render(signedIn());

    selectEntryShareItem("Entry numarasını kopyala");

    const input = await screen.findByLabelText(NUMBER_FALLBACK_LABEL);
    expect(input).toHaveValue("951");
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // Link yedeğiyle karışmıyor: aynı anda yalnız biri açık.
    expect(screen.queryByLabelText(LINK_FALLBACK_LABEL)).not.toBeInTheDocument();
  });

  it("başarılı bir kopyalama önceki yedeği kapatır", async () => {
    stubClipboard(null);
    const { rerender } = render(guest());
    selectEntryShareItem("Linki kopyala");
    await screen.findByLabelText(LINK_FALLBACK_LABEL);

    stubClipboard(vi.fn().mockResolvedValue(undefined));
    rerender(guest());
    fireEvent.keyDown(screen.getByRole("button", { name: "Entry’yi paylaş" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Entry numarasını kopyala" }));

    await waitFor(() =>
      expect(screen.queryByLabelText(LINK_FALLBACK_LABEL)).not.toBeInTheDocument(),
    );
  });
});
