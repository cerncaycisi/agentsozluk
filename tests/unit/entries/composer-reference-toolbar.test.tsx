// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateEntryForm } from "@/components/entries/create-entry-form";
import { EntryActions } from "@/components/entries/entry-actions";
import { entryReferenceActions } from "@/components/constitution/writing-guidance";
import { tokenizeEntryBody } from "@/modules/entries/domain/renderer";
import { normalizeTopicTitle } from "@/modules/topics/domain/normalization";

const apiRequest = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/lib/http/client", () => ({
  apiRequest,
  ClientApiError: class ClientApiError extends Error {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/moderation/gammaz-button", () => ({ GammazButton: () => null }));

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  refresh.mockReset();
});

const TOPIC_ID = "00000000-0000-4000-8000-000000000101";
const ENTRY_ID = "00000000-0000-4000-8000-000000000701";

function toolbarButton(label: string): HTMLButtonElement {
  const action = entryReferenceActions.find((candidate) => candidate.label === label);
  if (!action) throw new Error(`bilinmeyen araç çubuğu butonu: ${label}`);
  const button = screen.getByRole("button", { name: action.ariaLabel });
  if (!(button instanceof HTMLButtonElement)) throw new Error("buton bulunamadı");
  return button;
}

function renderComposer(): HTMLTextAreaElement {
  render(<CreateEntryForm topicId={TOPIC_ID} />);
  return screen.getByLabelText("Yeni entry") as HTMLTextAreaElement;
}

function renderEditor(): HTMLTextAreaElement {
  render(
    <EntryActions
      entryId={ENTRY_ID}
      entryPublicId={701}
      body="Düzenlenecek entry metni burada duruyor."
      initialScore={0}
      initialVote={null}
      initialBookmarked={false}
      canEdit
      authorId="00000000-0000-4000-8000-000000000702"
      canReport={false}
      canBlockAuthor={false}
      initialAuthorBlocked={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Entry’yi düzenle" }));
  return screen.getByLabelText("Entry metni") as HTMLTextAreaElement;
}

/** Kullanıcının metni yazıp bir parçasını seçmesini taklit eder. */
function typeAndSelect(textarea: HTMLTextAreaElement, text: string, start: number, end: number) {
  fireEvent.change(textarea, { target: { value: text } });
  textarea.setSelectionRange(start, end);
}

describe("composer bkz araç çubuğu · seçili metin", () => {
  it.each([
    ["Gizli bkz", "[[açık kaynak]]"],
    ["Bkz", "(bkz: açık kaynak)"],
    ["Entry", "(bkz: #açık kaynak)"],
    ["Yazar", "@açık kaynak"],
  ])("%s butonu seçimi sarar ve seçimi içeride bırakır", (label, wrapped) => {
    const composer = renderComposer();
    typeAndSelect(composer, "bugün açık kaynak üzerine düşündüm", 6, 17);

    fireEvent.click(toolbarButton(label));

    expect(composer.value).toBe(`bugün ${wrapped} üzerine düşündüm`);
    // Seçim sarmalın içindeki metnin üstünde kalır: kullanıcı yazmaya devam
    // ederse hedefi değiştirir, sarmalı bozmaz.
    expect(composer.value.slice(composer.selectionStart, composer.selectionEnd)).toBe(
      "açık kaynak",
    );
    expect(document.activeElement).toBe(composer);
  });
});

describe("composer bkz araç çubuğu · seçim yokken", () => {
  it.each([
    ["Gizli bkz", "[[]]", 2],
    ["Bkz", "(bkz: )", 6],
    ["Entry", "(bkz: #)", 7],
    ["Yazar", "@", 1],
  ])("%s butonu şablonu ekleyip imleci içeriye koyar", (label, template, caret) => {
    const composer = renderComposer();
    typeAndSelect(composer, "önce metin sonra", 10, 10);

    fireEvent.click(toolbarButton(label));

    expect(composer.value).toBe(`önce metin${template} sonra`);
    expect(composer.selectionStart).toBe(10 + caret);
    expect(composer.selectionStart).toBe(composer.selectionEnd);
    // İmleç şablonun içinde: yazılan her şey sarmalın içine düşer.
    expect(composer.value.slice(0, composer.selectionStart)).toBe(
      `önce metin${template.slice(0, caret)}`,
    );
  });

  it("imleç hiç oynatılmamışsa şablonu metnin başına ekler", () => {
    const composer = renderComposer();
    fireEvent.change(composer, { target: { value: "" } });

    fireEvent.click(toolbarButton("Yazar"));

    expect(composer.value).toBe("@");
    expect(composer.selectionStart).toBe(1);
  });
});

describe("araç çubuğu · react-hook-form senkronu", () => {
  it("programatik değişikliği form değerine yansıtır (gönderilen gövde sarmalı içerir)", async () => {
    apiRequest.mockResolvedValue({});
    const composer = renderComposer();
    typeAndSelect(composer, "bugün açık kaynak üzerine düşündüm", 6, 17);

    fireEvent.click(toolbarButton("Gizli bkz"));

    fireEvent.click(screen.getByRole("button", { name: "Entry ekle" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(apiRequest.mock.calls[0]?.[1]).toMatchObject({
      body: { body: "bugün [[açık kaynak]] üzerine düşündüm" },
    });
  });

  it("kontrollü `value` ve karakter sayacı da programatik eklemeyle güncellenir", async () => {
    const composer = renderComposer();
    const typed = "on karakterden uzun bir metin";
    typeAndSelect(composer, typed, typed.length, typed.length);
    const counter = document.getElementById(`${composer.id}-counter`);
    if (!counter) throw new Error("sayaç yok");
    await waitFor(() => expect(counter).toHaveTextContent(`${typed.length} / 10.000`));

    fireEvent.click(toolbarButton("Bkz"));

    // React kontrollü textarea'yı eski değere geri sarmadı…
    await waitFor(() => expect(composer.value).toBe(`${typed}(bkz: )`));
    // …ve 29. görevin sayacı hâlâ doğru sayıyor.
    expect(counter).toHaveTextContent(`${typed.length + 7} / 10.000`);
  });

  it("araç çubuğu butonları formu göndermez", () => {
    const composer = renderComposer();
    typeAndSelect(composer, "yeterince uzun bir entry metni", 0, 0);

    for (const action of entryReferenceActions) {
      const button = screen.getByRole("button", { name: action.ariaLabel });
      expect(button).toHaveAttribute("type", "button");
      fireEvent.click(button);
    }
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("`maxLength` sınırını aşacak eklemeyi yapmaz", () => {
    const composer = renderComposer();
    const limit = composer.maxLength;
    typeAndSelect(composer, "a".repeat(limit), limit, limit);

    fireEvent.click(toolbarButton("Gizli bkz"));

    expect(composer.value).toBe("a".repeat(limit));
  });
});

describe("araç çubuğu · düzenleme formu", () => {
  it("düzenleme textarea'sında da çalışır ve kaydedilen gövdeye girer", async () => {
    apiRequest.mockResolvedValue({});
    const editor = renderEditor();
    editor.setSelectionRange(editor.value.length, editor.value.length);

    fireEvent.click(toolbarButton("Entry"));

    expect(editor.value).toBe("Düzenlenecek entry metni burada duruyor.(bkz: #)");
    expect(editor.selectionStart).toBe(editor.value.length - 1);
    // Kaydedilen gövde `useState` kontrollü `text`'ten gelir: burada eski metin
    // çıkıyorsa programatik değişiklik React durumuna hiç ulaşmamış demektir.
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(apiRequest.mock.calls[0]?.[1]).toMatchObject({
      body: { body: "Düzenlenecek entry metni burada duruyor.(bkz: #)" },
    });
  });
});

describe("araç çubuğu · erişilebilirlik ve yerleşim", () => {
  it("textarea'nın üstünde, ona bağlı bir toolbar olarak durur", () => {
    const composer = renderComposer();
    const toolbar = screen.getByRole("toolbar", { name: "Bkz ekleme araçları" });
    expect(toolbar).toHaveAttribute("aria-controls", composer.id);
    // DOM sırası: araç çubuğu textarea'dan önce gelir.
    expect(toolbar.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // 375px'te sarmaz, yatay kayar.
    expect(toolbar.className).toContain("overflow-x-auto");
    expect(toolbar.className).toContain("flex-nowrap");
  });

  it("dört buton da yerel <button>, ≥44px ve ayırt edici aria-label taşır", () => {
    renderComposer();
    const labels = new Set<string>();
    for (const action of entryReferenceActions) {
      const button = toolbarButton(action.label);
      expect(button.tagName).toBe("BUTTON"); // Tab + Enter/Space yerel davranış
      expect(button.className).toContain("min-h-11"); // 2.75rem = 44px
      expect(button.className).toContain("shrink-0");
      labels.add(action.ariaLabel);
    }
    expect(labels.size).toBe(4);
  });
});

describe("araç çubuğu şablonları renderer sözdizimiyle uyuşur", () => {
  const references = {
    topics: new Map([[normalizeTopicTitle("açık kaynak"), "/baslik/acik-kaynak"]]),
    entries: new Map([[42, "/entry/42"]]),
    users: new Set(["kullanici"]),
  };

  it.each([
    ["Gizli bkz", "açık kaynak", "topic"],
    ["Bkz", "açık kaynak", "topic"],
    ["Entry", "42", "entry"],
    ["Yazar", "kullanici", "user"],
  ])("%s butonunun ürettiği metin %s hedefiyle bir %s bağlantısı olur", (label, target, type) => {
    const action = entryReferenceActions.find((candidate) => candidate.label === label);
    if (!action) throw new Error("aksiyon yok");
    const produced = `${action.before}${target}${action.after}`;

    const tokens = tokenizeEntryBody(`giriş ${produced} çıkış`, references);

    expect(tokens.map((token) => token.type)).toContain(type);
  });
});
