// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryPreview, type EntryPreviewActions } from "@/components/entries/entry-preview";
import { safeInternalRedirect } from "@/lib/security/redirect";
import { openEntryOverflowMenu } from "./overflow-menu";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/moderation/gammaz-button", () => ({
  GammazButton: () => <button type="button">gammazla</button>,
}));

afterEach(() => cleanup());

function cssRule(selector: string): string {
  const css = readFileSync("src/app/globals.css", "utf8");
  const start = css.indexOf(`\n  ${selector} {`);
  expect(start, `${selector} globals.css içinde yok`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("\n  }", start));
}

const iconButtonRule = () => cssRule(".icon-button");

const entry = {
  id: "00000000-0000-4000-8000-000000000701",
  publicId: 701,
  body: "Misafirin oy düğmelerini gördüğü entry metni.",
  score: 12,
  createdAt: new Date("2026-01-02T10:00:00.000Z"),
  topic: {
    id: "00000000-0000-4000-8000-000000000101",
    publicId: 101,
    title: "Misafir başlığı",
    slug: "misafir-basligi",
  },
  author: {
    id: "00000000-0000-4000-8000-000000000001",
    username: "writer",
    displayName: "Writer",
  },
};

const signedInActions: EntryPreviewActions = {
  vote: null,
  bookmarked: false,
  canEdit: true,
  canReport: true,
  canBlockAuthor: true,
};

describe("misafir oy ve favori düğmeleri", () => {
  it("oy ve favori düğmelerini gösterir, üçünü de girişe bağlar", () => {
    render(<EntryPreview entry={entry} guestActions />);

    const expectedHref = "/giris?next=%2Fentry%2F701";
    for (const label of [
      "Artı oy vermek için giriş yapın",
      "Eksi oy vermek için giriş yapın",
      "Favorilere eklemek için giriş yapın",
    ]) {
      const control = screen.getByRole("link", { name: label });
      expect(control).toHaveAttribute("href", expectedHref);
      expect(control.className).toContain("icon-button");
    }
    // Geometri artık `globals.css`teki `.icon-button` içinde; orada doğrulanıyor.
    const rule = iconButtonRule();
    // Kutu kalktı ama dokunma hedefi 40×40 kaldı (SC 2.5.8 eşiği 24×24).
    expect(rule).toContain("size-10");
    // `rounded` (4px kontrol yarıçapı) — `rounded-lg` geçmesin diye desenle.
    expect(rule).toMatch(/\brounded(?![-\w])/u);
  });

  /**
   * Kontrolü tanıtan şey artık kenarlık değil İKONUN KENDİSİ: durgunken `--muted`,
   * sayfa zemininde açık 4.753 / koyu 6.974 — WCAG SC 1.4.11 eşiği 3.0. SC 1.4.11
   * "bir bileşeni TANIMLAMAK İÇİN GEREKEN" görsel bilgi için 3:1 istiyor, gereken
   * bilginin kenarlık olmasını değil.
   *
   * Kutu artık ayrı bir varyant (`.icon-button-boxed`) ve yalnız kabukta kullanılıyor.
   */
  it("ikon butonu çerçevesiz tanımlar; kutu ayrı bir varyanta taşındı", () => {
    const rule = iconButtonRule();
    // `@apply` listesinde kenarlık YOK (`border-color` yalnız geçiş listesinde geçer).
    expect(rule).not.toMatch(/@apply[^;]*\bborder\b/u);
    expect(rule).not.toContain("border-color: rgb(var(--border-strong))");

    const boxed = cssRule(".icon-button-boxed");
    expect(boxed).toMatch(/@apply[^;]*\bborder\b/u);
    // Kabuktaki kutu hâlâ SC 1.4.11'i kenarlıkla karşılıyor: 3.127 / 3.487.
    expect(boxed).toContain("border-color: rgb(var(--border-strong))");
  });

  it("dört durumu ve seçili dolgunun hover davranışını korur", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain(".icon-button:hover:not(:disabled) {");
    expect(css).toContain(".icon-button:active:not(:disabled) {");
    expect(css).toContain(".icon-button:disabled {");
    // Kutu kalkınca durum katmanı tek başına konuşuyor; sönük ikon hover'da `--ink`e çıkar.
    expect(css).toContain('.icon-button:hover:not(:disabled):not([aria-pressed="true"]) {');
    // Seçili (dolgulu) hâl hover'da yerini KAYBETMEZ: örtü dolgunun üstüne biner.
    expect(css).toContain('.icon-button[aria-pressed="true"]:hover:not(:disabled) {');
  });

  /**
   * İçerik satırı ile kabuk arasındaki ayrım sözleşmenin kendisi: entry aksiyonları
   * kutu varyantını ASLA almaz. Alsalardı iki-üç satırlık entry metninin yanında
   * beş çerçeve metinden ağır çıkardı — bu turun çıkış noktası buydu.
   */
  it("içerik satırındaki ikon kontrollerine kutu varyantını vermez", () => {
    const { container } = render(<EntryPreview entry={entry} actions={signedInActions} />);

    const controls = [...container.querySelectorAll(".icon-button")];
    expect(controls.length).toBeGreaterThanOrEqual(4);
    for (const control of controls) {
      expect(control.className).not.toContain("icon-button-boxed");
    }
  });

  /**
   * Kutu kalkınca seçili oyun/favorinin TEK sınırı doygun dolgu oluyor. Sayfa
   * zeminine karşı ölçüldü: primary 5.741 (açık) / 6.903 (koyu), accent 7.332 /
   * 6.974 — SC 1.4.11 eşiği 3.0. Dolgunun üstündeki ikon 6.374 / 6.903 ve
   * 8.141 / 6.974.
   */
  it("seçili oy ve favoriyi kutu olmadan dolguyla anlatmayı sürdürür", () => {
    const { container } = render(
      <EntryPreview entry={entry} actions={{ ...signedInActions, vote: 1, bookmarked: true }} />,
    );

    const upvote = screen.getByRole("button", { name: "Artı oy ver" });
    const bookmark = screen.getByRole("button", { name: "Favorilerden çıkar" });
    for (const pressed of [upvote, bookmark]) {
      expect(pressed).toHaveAttribute("aria-pressed", "true");
      expect(pressed.className).toContain("bg-primary");
      expect(pressed.className).toContain("text-on-primary");
    }
    // Basılı olmayan kontrolde dolgu YOK: `bg-page` de kalktı, çünkü entry akan
    // listede zaten sayfa zemininde duruyor — hiçbir şey çizmeyen bir dolguydu.
    const downvote = screen.getByRole("button", { name: "Eksi oy ver" });
    expect(downvote.className).not.toMatch(/\bbg-/u);
    expect(container.querySelector(".icon-button-boxed")).toBeNull();
  });

  /**
   * Zorunlu renk kipinde (Windows yüksek kontrast) tarayıcı zemin/kenarlık/metin
   * renklerini kullanıcı paletiyle eziyor: `bg-primary` dolgusu da `--overlay-*`
   * gradyanı da yok sayılıyor. Kutu kalktıktan sonra basılı oy ile basılı olmayanı
   * ayıran hiçbir GÖRSEL kanal kalmıyordu (`aria-pressed` yalnız ekran okuyucuyu
   * kurtarıyor). Ölçüldü: emülasyonda basılı düğme `Highlight` dolgu + `HighlightText`
   * ikon, basılı olmayan saydam zemin + `ButtonBorder` kenarlık.
   */
  it("zorunlu renk kipinde basılı durumu sistem renkleriyle yeniden kurar", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const start = css.indexOf("@media (forced-colors: active) {");
    expect(start, "forced-colors dalı globals.css içinde yok").toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf("\n  }\n", start));

    // Kutu bu kipte geri geliyor: incelik değil açık sınır okunuyor.
    expect(block).toMatch(/\.icon-button \{\s*border: 1px solid ButtonBorder;/u);
    // Basılı hâl sistem vurgu çiftiyle anlatılıyor (bu blokta sistem renkleri ezilmiyor).
    expect(block).toContain('.icon-button[aria-pressed="true"]');
    expect(block).toContain("background-color: Highlight;");
    expect(block).toContain("color: HighlightText;");
    // %50 opaklık bu kipte "devre dışı" demiyor.
    expect(block).toContain("color: GrayText;");
  });

  it("eksi oyu marka rengiyle değil nötr `--accent` dolgusuyla işaretler", () => {
    render(<EntryPreview entry={entry} actions={{ ...signedInActions, vote: -1 }} />);

    const downvote = screen.getByRole("button", { name: "Eksi oy ver" });
    expect(downvote).toHaveAttribute("aria-pressed", "true");
    expect(downvote.className).toContain("bg-accent");
    expect(downvote.className).toContain("text-on-accent");
  });

  it("dönüş adresi olarak entry'nin kalıcı adresini kullanır, başlığı değil", () => {
    render(<EntryPreview entry={entry} guestActions />);

    const href = screen
      .getByRole("link", { name: "Artı oy vermek için giriş yapın" })
      .getAttribute("href");
    const next = new URLSearchParams(href?.split("?")[1] ?? "").get("next");

    expect(next).toBe("/entry/701");
    expect(next).not.toContain("/baslik/");
    // Giriş formu `next`'i bu kapıdan geçiriyor; göreli yol olduğu için korunmalı.
    expect(safeInternalRedirect(next)).toBe("/entry/701");
  });

  it("skoru gösterir ama basılı durum taklidi yapmaz ve disabled düğme kullanmaz", () => {
    const { container } = render(<EntryPreview entry={entry} guestActions />);

    // Görünen metin yalnız sayı; birim yalnız ekran okuyucuya söyleniyor.
    const score = screen.getByText("12");
    expect(score).toBeVisible();
    expect(score).toHaveTextContent("12 puan");
    expect(score.querySelector(".sr-only")).toHaveTextContent("puan");
    expect(container.querySelector("[aria-pressed]")).toBeNull();
    expect(container.querySelector("[disabled]")).toBeNull();
    expect(container.querySelector("[aria-disabled]")).toBeNull();
  });

  it("guestActions verilmezse hiç eylem göstermez", () => {
    // /debe, /yazar, /takip/yazarlar ve favoriler/oylarım oturum durumunu hiç
    // hesaplamadan actions geçmiyor. Orada misafir düğmesi göstermek, giriş yapmış
    // kullanıcıya "giriş yapın" bağlantısı sunardı.
    const { container } = render(<EntryPreview entry={entry} />);

    expect(container.querySelector('a[href^="/giris"]')).toBeNull();
    expect(
      screen.queryByRole("link", { name: /oy vermek için giriş yapın/iu }),
    ).not.toBeInTheDocument();
  });

  it("oturum gerektiren yönetim işlemlerini misafire göstermez", () => {
    render(<EntryPreview entry={entry} guestActions />);

    expect(screen.queryByRole("button", { name: "Entry’yi düzenle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Entry’yi sil" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sürümler" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "gammazla" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yazarı engelle" })).not.toBeInTheDocument();
  });

  it("misafirde ⋮ menüsü görünür ama yalnız oturumsuz işlemi taşır", async () => {
    render(<EntryPreview entry={entry} guestActions />);

    expect(screen.getByRole("button", { name: "Diğer entry işlemleri" })).toBeVisible();
    openEntryOverflowMenu();

    // "Linki kopyala" giriş istemiyor; menünün misafirdeki tek öğesi o.
    expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual([
      "Linki kopyala",
    ]);
  });

  it("oturum açmış kullanıcıda düğmeleri gerçek düğme olarak bırakır", () => {
    const { container } = render(<EntryPreview entry={entry} actions={signedInActions} />);

    const upvote = screen.getByRole("button", { name: "Artı oy ver" });
    expect(upvote).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Favorilere ekle" })).toBeVisible();
    openEntryOverflowMenu();
    expect(screen.getByRole("menuitem", { name: "Entry’yi düzenle" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Entry’yi sil" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Sürümler" })).toHaveAttribute(
      "href",
      "/entry/701/revizyonlar",
    );
    expect(container.querySelector('a[href^="/giris"]')).toBeNull();
    expect(screen.queryByLabelText("Artı oy vermek için giriş yapın")).not.toBeInTheDocument();
  });
});
