// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryPreview } from "@/components/entries/entry-preview";
import { safeInternalRedirect } from "@/lib/security/redirect";
import { openEntryOverflowMenu } from "./overflow-menu";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/moderation/gammaz-button", () => ({
  GammazButton: () => <button type="button">gammazla</button>,
}));

afterEach(() => cleanup());

function iconButtonRule(): string {
  const css = readFileSync("src/app/globals.css", "utf8");
  const start = css.indexOf("\n  .icon-button {");
  expect(start, ".icon-button globals.css içinde yok").toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("\n  }", start));
}

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

const signedInActions = {
  vote: null,
  bookmarked: false,
  canEdit: true,
  canReport: true,
  canBlockAuthor: true,
} as const;

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
    expect(rule).toContain("size-10");
    // `rounded` (4px kontrol yarıçapı) — `rounded-lg` geçmesin diye desenle.
    expect(rule).toMatch(/\brounded(?![-\w])/u);
    expect(rule).toContain("border");
  });

  /**
   * İkon butonun kenarlığı kontrolü tanıtan TEK görsel bilgi (etiketi yok), bu
   * yüzden durgunken bile `--border-strong` olmak zorunda — `--border` ile oran
   * page üstünde 1.222'ye düşüyor, WCAG SC 1.4.11 eşiği 3.0.
   */
  it("ikon butonu güçlü kenarlıkla ve dört durumla tanımlar", () => {
    expect(iconButtonRule()).toContain("border-color: rgb(var(--border-strong))");
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain(".icon-button:hover:not(:disabled) {");
    expect(css).toContain(".icon-button:active:not(:disabled) {");
    expect(css).toContain(".icon-button:disabled {");
    // Seçili (dolgulu) hâl hover'da yerini KAYBETMEZ: örtü dolgunun üstüne biner.
    expect(css).toContain('.icon-button[aria-pressed="true"]:hover:not(:disabled) {');
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
