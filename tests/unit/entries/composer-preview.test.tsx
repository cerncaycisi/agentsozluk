// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateEntryForm } from "@/components/entries/create-entry-form";
import { EntryWritingGuidance } from "@/components/constitution/writing-guidance";

const apiRequest = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/lib/http/client", () => ({
  apiRequest,
  ClientApiError: class ClientApiError extends Error {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  refresh.mockReset();
});

const TOPIC_ID = "00000000-0000-4000-8000-000000000101";

/** Dört bkz sözdizimi + bir dış bağlantı: `entryReferenceActions`'ın tamamı. */
const ALL_SYNTAXES =
  "[[açık kaynak]] ile (bkz: başka başlık) ve (bkz: #123) sonra @yazar ve https://example.com";

function renderComposer(): HTMLTextAreaElement {
  render(<CreateEntryForm topicId={TOPIC_ID} />);
  return screen.getByLabelText("Yeni entry") as HTMLTextAreaElement;
}

function tab(name: "Yaz" | "Önizle"): HTMLElement {
  return screen.getByRole("tab", { name });
}

async function typeBody(composer: HTMLTextAreaElement, value: string): Promise<void> {
  fireEvent.change(composer, { target: { value } });
  await waitFor(() => expect(composer).toHaveValue(value));
}

describe("composer önizleme sekmeleri", () => {
  it("Yaz sekmesiyle açılır ve panelleri sekmelere bağlar", () => {
    const composer = renderComposer();

    expect(screen.getByRole("tablist", { name: "Editör görünümü" })).toBeInTheDocument();
    expect(tab("Yaz")).toHaveAttribute("aria-selected", "true");
    expect(tab("Önizle")).toHaveAttribute("aria-selected", "false");

    // Görünür tek panel yazma paneli ve textarea onun içinde.
    const panels = screen.getAllByRole("tabpanel");
    expect(panels).toHaveLength(1);
    const writePanel = panels[0] as HTMLElement;
    expect(writePanel).toContainElement(composer);
    expect(writePanel).toHaveAttribute("id", tab("Yaz").getAttribute("aria-controls"));
    expect(writePanel).toHaveAttribute("aria-labelledby", tab("Yaz").id);

    // Sekmeler `type="button"`: formu göndermezler.
    expect(tab("Önizle")).toHaveAttribute("type", "button");
  });

  it("ok, Home ve End tuşlarıyla gezilir; odak seçili sekmeyi izler", () => {
    renderComposer();
    tab("Yaz").focus();

    // Roving tabindex: Tab tuşu şeritte tek durak görür.
    expect(tab("Yaz")).toHaveAttribute("tabindex", "0");
    expect(tab("Önizle")).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(tab("Yaz"), { key: "ArrowRight" });
    expect(tab("Önizle")).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(tab("Önizle"));
    expect(tab("Önizle")).toHaveAttribute("tabindex", "0");

    // Sona gelince başa sarar.
    fireEvent.keyDown(tab("Önizle"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab("Yaz"));
    fireEvent.keyDown(tab("Yaz"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tab("Önizle"));

    fireEvent.keyDown(tab("Önizle"), { key: "Home" });
    expect(tab("Yaz")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab("Yaz"), { key: "End" });
    expect(tab("Önizle")).toHaveAttribute("aria-selected", "true");

    // İlgisiz tuş sekmeyi değiştirmez.
    fireEvent.keyDown(tab("Önizle"), { key: "a" });
    expect(tab("Önizle")).toHaveAttribute("aria-selected", "true");
  });

  it("sekme değişiminde yazılan metni ve sayacı korur", async () => {
    const composer = renderComposer();
    const counter = document.getElementById(`${composer.id}-counter`);
    if (!counter) throw new Error("sayaç yok");
    await typeBody(composer, "a".repeat(1234));

    fireEvent.click(tab("Önizle"));
    // Textarea DOM'da kalır: değer duruyor, yalnız gizleniyor.
    expect(composer).toHaveValue("a".repeat(1234));
    expect(composer).not.toBeVisible();
    // Sayaç iki panelin de dışında: önizlemedeyken de okunuyor.
    expect(counter).toBeVisible();
    expect(counter).toHaveTextContent("1.234 / 10.000");

    fireEvent.click(tab("Yaz"));
    expect(composer).toBeVisible();
    expect(composer).toHaveValue("a".repeat(1234));
    expect(counter).toHaveTextContent("1.234 / 10.000");
  });

  it("doğrulama hatası belirince yazma paneline döner, sonra önizleme yine açılabilir", async () => {
    renderComposer();
    fireEvent.click(tab("Önizle"));
    expect(tab("Önizle")).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: "Entry ekle" }));

    // Hata metni panellerin dışında ama düzeltilecek yer textarea:
    // kullanıcıyı hatanın çözülebileceği panele geri alıyoruz.
    await waitFor(() => expect(tab("Yaz")).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByText("Entry metni zorunludur.")).toBeVisible();
    expect(screen.getByLabelText("Yeni entry")).toBeVisible();

    // Hata dururken önizleme yine de kilitlenmiş olmamalı.
    fireEvent.click(tab("Önizle"));
    expect(tab("Önizle")).toHaveAttribute("aria-selected", "true");
  });

  it("boş metinde önizlenecek bir şey olmadığını söyler", () => {
    renderComposer();
    fireEvent.click(tab("Önizle"));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Önizlenecek bir şey yok");
  });
});

describe("composer önizleme render'ı", () => {
  it("dört sözdizimini de istemcide çözümlenebildiği kadarıyla gösterir", async () => {
    const composer = renderComposer();
    await typeBody(composer, ALL_SYNTAXES);
    fireEvent.click(tab("Önizle"));

    const panel = within(screen.getByRole("tabpanel"));

    // Gizli bkz: hedef bilinmediği için başlık aramasına gider (yayımlanan
    // hâlde de açılmamış başlıklar aynı yere gider).
    expect(panel.getByRole("link", { name: "açık kaynak" })).toHaveAttribute(
      "href",
      "/ara?q=a%C3%A7%C4%B1k%20kaynak&type=topics",
    );
    // Dış bağlantı önizlemede de yayımlanan hâlle birebir aynı.
    const external = panel.getByRole("link", { name: "https://example.com" });
    expect(external).toHaveAttribute("target", "_blank");
    expect(external).toHaveAttribute("rel", "nofollow ugc noopener noreferrer");

    // Kalan üç sözdizimi: referans indeksi olmadığı için düz metin.
    for (const literal of ["(bkz: başka başlık)", "(bkz: #123)", "@yazar"])
      expect(screen.getByRole("tabpanel")).toHaveTextContent(literal, {
        normalizeWhitespace: true,
      });
    for (const name of [/başka başlık/u, /#123/u, /@yazar/u])
      expect(panel.queryByRole("link", { name })).toBeNull();
  });

  it("metin değişince önizleme tazelenir", async () => {
    const composer = renderComposer();
    await typeBody(composer, "ilk hâli yeterince uzun bir entry metni");
    fireEvent.click(tab("Önizle"));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("ilk hâli");

    fireEvent.click(tab("Yaz"));
    await typeBody(composer, "ikinci hâli yeterince uzun bir entry metni");
    fireEvent.click(tab("Önizle"));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("ikinci hâli");
    expect(screen.getByRole("tabpanel")).not.toHaveTextContent("ilk hâli");
  });
});

describe("önizlemenin referans çözümleme sınırı", () => {
  it("sınırı önizleme panelinde açıkça yazar", async () => {
    const composer = renderComposer();
    await typeBody(composer, ALL_SYNTAXES);
    fireEvent.click(tab("Önizle"));

    const note = screen.getByRole("tabpanel").textContent ?? "";
    expect(note).toContain("Önizleme hedefleri denetlemez");
    // Üç iddianın üçü de yazılı olmalı.
    expect(note).toContain("gizli bkz burada her zaman başlık aramasına gider");
    expect(note).toContain("düz metin kalır");
    expect(note).toContain("mevcut ve görünür hedefler bağlantıya dönüşür");
  });

  it("`EntryWritingGuidance` ile aynı kuralı aynı sözcüklerle anlatır", async () => {
    const composer = renderComposer();
    await typeBody(composer, ALL_SYNTAXES);
    fireEvent.click(tab("Önizle"));
    const previewNote = (screen.getByRole("tabpanel").textContent ?? "").toLocaleLowerCase("tr-TR");
    cleanup();

    const { container } = render(<EntryWritingGuidance />);
    const guidance = (container.textContent ?? "").toLocaleLowerCase("tr-TR");

    // İki metin de aynı iki kuralı taşımalı; biri değişip diğeri kalırsa
    // composer kullanıcıya sözlüğün gerçek davranışını yanlış anlatır.
    for (const clause of [
      "mevcut ve görünür hedefler bağlantıya dönüşür",
      "başlık aramasına gider",
    ]) {
      expect(previewNote).toContain(clause);
      expect(guidance).toContain(clause);
    }
  });
});
