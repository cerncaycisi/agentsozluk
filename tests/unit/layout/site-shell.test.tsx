// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteShell } from "@/components/layout/site-shell";

const navigation = vi.hoisted(() => ({ pathname: "/gundem", push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));

describe("site shell topic navigation", () => {
  beforeEach(() => {
    navigation.pathname = "/gundem";
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        const feed = new URL(url, "http://localhost").searchParams.get("feed") ?? "recent";
        const page = Number(new URL(url, "http://localhost").searchParams.get("page") ?? 1);
        const label = feed === "trending" ? "Gündem" : feed === "new" ? "Yeni" : "Son";
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  id:
                    page === 1
                      ? "00000000-0000-4000-8000-000000000123"
                      : "00000000-0000-4000-8000-000000000124",
                  publicId: page === 1 ? 123 : 124,
                  title: `${label} başlığı${page === 1 ? "" : " devam"}`,
                  slug: `${label.toLocaleLowerCase("tr-TR")}-basligi${page === 1 ? "" : "-devam"}`,
                  entryCount: 31,
                  activeEntryCount: feed === "recent" ? 4 : 2,
                },
              ],
              meta: { hasNextPage: page === 1, totalItems: 21 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("falls back to the 24-hour recent index on routes without an index feed", async () => {
    navigation.pathname = "/";
    render(
      <SiteShell viewer={null}>
        <main id="ana-icerik">İçerik</main>
      </SiteShell>,
    );

    const topicNavigation = await screen.findByRole("navigation", { name: "Son başlıkları" });
    const topicLink = within(topicNavigation).getByRole("link", { name: /Son başlığı/u });
    expect(topicLink).toHaveAttribute("href", "/baslik/son-basligi--123?window=24h");
    expect(topicLink).toHaveTextContent("4");
    expect(topicLink).not.toHaveTextContent("31");
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/topics?feed=recent&window=24h&page=1&pageSize=20",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("renders the header menu as real links and marks the current route", async () => {
    render(
      <SiteShell viewer={null}>
        <main id="ana-icerik">İçerik</main>
      </SiteShell>,
    );

    const mainNavigation = screen.getByRole("navigation", { name: "Ana menü" });
    const expected = [
      ["Son", "/son"],
      ["Gündem", "/gundem"],
      ["Yeni", "/yeni"],
      ["DEBE", "/debe"],
    ] as const;
    for (const [name, href] of expected) {
      expect(within(mainNavigation).getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(within(mainNavigation).queryAllByRole("button")).toHaveLength(0);
    expect(within(mainNavigation).getByRole("link", { name: "Gündem" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(mainNavigation).getByRole("link", { name: "Son" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps the main menu as a horizontally scrolling strip at every width", async () => {
    render(
      <SiteShell viewer={null}>
        <main id="ana-icerik">İçerik</main>
      </SiteShell>,
    );

    const mainNavigation = screen.getByRole("navigation", { name: "Ana menü" });
    const header = mainNavigation.closest("header");
    expect(header).not.toBeNull();
    expect(header).toHaveClass("sticky", "top-0");

    // Şerit hiçbir kırılma noktasında gizlenmiyor (eski `hidden ... md:flex` kalktı).
    const stripClasses = mainNavigation.className.split(/\s+/u);
    expect(stripClasses).not.toContain("hidden");
    expect(stripClasses.some((token) => /^(?:sm|md|lg|xl|2xl):(?:hidden|flex)$/u.test(token))).toBe(
      false,
    );

    // Sarmıyor, yatay kayıyor, kaydırma çubuğu gizli.
    expect(stripClasses).toContain("flex");
    expect(stripClasses).toContain("overflow-x-auto");
    expect(stripClasses).toContain("[scrollbar-width:none]");
    expect(stripClasses).toContain("[&::-webkit-scrollbar]:hidden");

    // Her öğe küçülmüyor ve en az 44px (min-h-11) dokunma yüksekliği taşıyor.
    const items = within(mainNavigation).getAllByRole("link");
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item).toHaveClass("shrink-0", "min-h-11", "whitespace-nowrap");
    }
  });

  it("derives the sidebar index from the route instead of an index selector", async () => {
    render(
      <SiteShell viewer={null}>
        <main id="ana-icerik">İçerik</main>
      </SiteShell>,
    );

    expect(
      await screen.findByRole("navigation", { name: "Gündem başlıkları" }),
    ).toBeInTheDocument();
    const sidebar = screen.getByRole("complementary", { name: "Başlık indeksi" });
    expect(within(sidebar).getByRole("heading", { name: "Gündem" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Başlık indeksi" })).not.toBeInTheDocument();
    expect(screen.getByText("İçerik")).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1/topics?feed=trending&window=24h&page=1&pageSize=20",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(window.localStorage.getItem("ajan_topic_index")).toBeNull();
  });

  it("keeps the scroll position of the index the route resolves to", async () => {
    navigation.pathname = "/yeni";
    window.sessionStorage.setItem("ajan_topic_index_scroll:new", "175");

    render(
      <SiteShell viewer={null}>
        <main id="ana-icerik">İçerik</main>
      </SiteShell>,
    );

    await screen.findByRole("navigation", { name: "Yeni başlıkları" });
    const sidebar = screen.getByRole("complementary", { name: "Başlık indeksi" });
    await waitFor(() => expect(sidebar.scrollTop).toBe(175));

    sidebar.scrollTop = 240;
    fireEvent.scroll(sidebar);
    expect(window.sessionStorage.getItem("ajan_topic_index_scroll:new")).toBe("240");
  });

  it("refreshes from the first page and appends the bounded continuation", async () => {
    navigation.pathname = "/son";
    const user = userEvent.setup();
    render(
      <SiteShell viewer={null}>
        <main id="ana-icerik">İçerik</main>
      </SiteShell>,
    );

    await screen.findByRole("link", { name: /Son başlığı/u });
    await user.click(screen.getByRole("button", { name: "Daha fazla başlık yükle" }));
    expect(await screen.findByRole("link", { name: /Son başlığı devam/u })).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1/topics?feed=recent&window=24h&page=2&pageSize=20",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    const callsBeforeRefresh = vi.mocked(fetch).mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Son başlıklarını yenile" }));
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(callsBeforeRefresh),
    );
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1/topics?feed=recent&window=24h&page=1&pageSize=20",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("closes the mobile drawer when a contextual topic is selected", async () => {
    const user = userEvent.setup();
    render(
      <SiteShell viewer={null}>
        <main id="ana-icerik">İçerik</main>
      </SiteShell>,
    );

    const trigger = screen.getByRole("button", { name: "Başlık menüsünü aç" });
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Başlık menüsü" });
    const topicLink = await within(dialog).findByRole("link", { name: /Gündem başlığı/u });
    expect(topicLink).toHaveAttribute("href", "/baslik/gündem-basligi--123?window=24h");
    expect(within(dialog).queryByRole("group", { name: "Başlık indeksi" })).not.toBeInTheDocument();
    topicLink.addEventListener("click", (event) => event.preventDefault(), { once: true });

    await user.click(topicLink);

    expect(screen.queryByRole("dialog", { name: "Başlık menüsü" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gündem başlığı/u })).toBeInTheDocument();
  });
});

describe("header search on narrow viewports", () => {
  beforeEach(() => {
    navigation.pathname = "/gundem";
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation((url: string | URL | Request) =>
          Promise.resolve(
            new Response(
              JSON.stringify(
                String(url).includes("/search/suggest")
                  ? { topics: [{ title: "yapay zekâ", url: "/baslik/yapay-zeka--1" }], users: [] }
                  : { data: [], meta: { hasNextPage: false, totalItems: 0 } },
              ),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          ),
        ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const renderShell = () =>
    render(
      <SiteShell viewer={null}>
        <main id="ana-icerik">İçerik</main>
      </SiteShell>,
    );

  const searchPanel = () => document.getElementById("mobil-arama");

  it("exposes a 44px search trigger that is hidden from 640px up", () => {
    renderShell();

    const trigger = screen.getByRole("button", { name: "Aramayı aç" });
    expect(trigger).toHaveClass("min-h-11", "min-w-11", "sm:hidden");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls", "mobil-arama");
    // Kapalıyken panel DOM'da yok, dolayısıyla header yüksekliğine hiç katkı vermiyor.
    expect(searchPanel()).toBeNull();
  });

  it("opens the panel in one tap, focuses the input and reuses the /ara form", async () => {
    const user = userEvent.setup();
    renderShell();

    const trigger = screen.getByRole("button", { name: "Aramayı aç" });
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = searchPanel();
    expect(panel).not.toBeNull();
    expect(panel).toHaveClass("sm:hidden");

    const input = within(panel as HTMLElement).getByLabelText("Sözlükte ara");
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("name", "q");
    const form = input.closest("form");
    expect(form).toHaveAttribute("action", "/ara");
    expect(form).toHaveAttribute("role", "search");

    // Açılır satır modal değil: sayfa kaydırması kilitlenmiyor.
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("closes on Escape and hands focus back to the trigger", async () => {
    const user = userEvent.setup();
    renderShell();

    const trigger = screen.getByRole("button", { name: "Aramayı aç" });
    await user.click(trigger);
    expect(searchPanel()).not.toBeNull();

    await user.keyboard("{Escape}");

    expect(searchPanel()).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("closes on an outside click without stealing focus back", async () => {
    const user = userEvent.setup();
    renderShell();

    const trigger = screen.getByRole("button", { name: "Aramayı aç" });
    await user.click(trigger);
    expect(searchPanel()).not.toBeNull();

    await user.click(screen.getByText("İçerik"));

    expect(searchPanel()).toBeNull();
    expect(trigger).not.toHaveFocus();
  });

  it("gives the panel input the same combobox as the inline form", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "Aramayı aç" }));
    const panel = searchPanel() as HTMLElement;
    const input = within(panel).getByRole("combobox", { name: "Sözlükte ara" });
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-controls", "mobil-arama-input-oneriler");

    await user.keyboard("ya");

    const listbox = await within(panel).findByRole("listbox", { name: "Arama önerileri" });
    expect(within(listbox).getByRole("option", { name: "yapay zekâ" })).toHaveAttribute(
      "href",
      "/baslik/yapay-zeka--1",
    );

    // İlk Esc yalnız öneri listesini kapatır, panel açık kalır.
    await user.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(searchPanel()).not.toBeNull();
    expect(input).toHaveFocus();

    // İkinci Esc paneli kapatır ve focus tetikleyiciye döner.
    await user.keyboard("{Escape}");
    expect(searchPanel()).toBeNull();
    expect(screen.getByRole("button", { name: "Aramayı aç" })).toHaveFocus();
  });

  it("leaves the inline form used from 640px up untouched", async () => {
    const user = userEvent.setup();
    renderShell();

    const inlineInput = document.getElementById("header-search");
    expect(inlineInput).not.toBeNull();
    expect(inlineInput).toHaveAttribute("name", "q");
    const inlineForm = inlineInput?.closest("form");
    expect(inlineForm).toHaveAttribute("action", "/ara");
    expect(inlineForm).toHaveAttribute("role", "search");
    expect(inlineForm).toHaveClass("ml-auto", "hidden", "max-w-xs", "flex-1", "sm:block");

    // Panel açılınca da geniş ekran formu yerinde kalıyor.
    await user.click(screen.getByRole("button", { name: "Aramayı aç" }));
    expect(document.getElementById("header-search")).toBe(inlineInput);
  });
});

describe("header account call to action", () => {
  beforeEach(() => {
    navigation.pathname = "/gundem";
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [], meta: { hasNextPage: false, totalItems: 0 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const renderShell = (viewer: Parameters<typeof SiteShell>[0]["viewer"]) =>
    render(
      <SiteShell viewer={viewer}>
        <main id="ana-icerik">İçerik</main>
      </SiteShell>,
    );

  const header = () => document.querySelector("header") as HTMLElement;

  it("gives a guest one-tap routes to both /kayit and /giris", () => {
    renderShell(null);

    const signUp = within(header()).getByRole("link", { name: "Kayıt ol" });
    const signIn = within(header()).getByRole("link", { name: "Giriş" });

    expect(signUp).toHaveAttribute("href", "/kayit");
    expect(signIn).toHaveAttribute("href", "/giris");
    // `.button-primary` / `.button-secondary` min-h-11 taşıyor: iki CTA da ≥44px.
    expect(signUp).toHaveClass("button-primary");
    expect(signIn).toHaveClass("button-secondary");
  });

  it("puts the primary call to action where the account menu sits and keeps the strip intact", () => {
    renderShell(null);

    // Dar ekran kümesi ("satır 1"): hesap menüsüyle aynı yer, tema düğmesinin yanı.
    const signUp = within(header()).getByRole("link", { name: "Kayıt ol" });
    const strip = screen.getByRole("navigation", { name: "Ana menü" });
    const [row1, row2] = [...(header().firstElementChild as HTMLElement).children];
    expect(row1?.contains(signUp)).toBe(true);
    expect(row1?.contains(strip)).toBe(false);

    // 375px'te satır 1'de iki CTA'ya yer yok: "Giriş" ikinci kümede,
    // ama kaydırılan şeridin dışında, yani şerit hâlâ dört öğe.
    const signIn = within(header()).getByRole("link", { name: "Giriş" });
    expect(strip.contains(signIn)).toBe(false);
    expect(within(strip).getAllByRole("link")).toHaveLength(4);
    expect(row2?.contains(signIn)).toBe(true);
    expect(strip.parentElement?.contains(signIn)).toBe(true);
    expect(signIn).toHaveClass("shrink-0");
  });

  it("changes nothing for a signed-in reader", () => {
    renderShell({ username: "deneme", displayName: "Deneme Yazar", role: "USER" });

    expect(screen.getByRole("button", { name: "Hesap menüsünü aç" })).toBeInTheDocument();
    expect(within(header()).queryByRole("link", { name: "Kayıt ol" })).toBeNull();
    expect(within(header()).queryByRole("link", { name: "Giriş" })).toBeNull();
    expect(
      within(screen.getByRole("navigation", { name: "Ana menü" })).getAllByRole("link"),
    ).toHaveLength(4);
  });
});

/**
 * Başlık geniş ekranda TEK satır. Eski hâlde ikinci kap 1280px'te 45px yer
 * kaplıyor ve %77'si boş duruyordu (dört nav öğesi x=294'te bitiyor, sağında
 * 986px). Ölçüldü: 110px → 65px (1024/1280/1440), dar ekranda 102 → 101.
 *
 * jsdom CSS uygulamıyor, dolayısıyla burada doğrulanan şey SÖZLEŞME: tek saran
 * kap, `lg`den itibaren `display: contents`e dönen iki küme ve tek satırın
 * `order` dizilimi. Piksel doğrulaması e2e'nin ve el ölçümünün işi.
 */
describe("wide header collapses to a single row", () => {
  beforeEach(() => {
    navigation.pathname = "/gundem";
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [], meta: { hasNextPage: false, totalItems: 0 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const renderShell = (viewer: Parameters<typeof SiteShell>[0]["viewer"] = null) =>
    render(
      <SiteShell viewer={viewer}>
        <main id="ana-icerik">İçerik</main>
      </SiteShell>,
    );

  const header = () => document.querySelector("header") as HTMLElement;
  const shell = () => header().firstElementChild as HTMLElement;
  const orderOf = (element: Element) =>
    Number(/(?:^|\s)lg:order-(\d+)(?:\s|$)/u.exec(element.className)?.[1] ?? Number.NaN);

  it("uses one wrapping container whose two groups dissolve from lg up", () => {
    renderShell();

    expect(shell().className).toContain("flex-wrap");
    const groups = [...shell().children];
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      // `display: contents` — çocuklar aynı esnek satırın öğesi oluyor.
      expect(group.className).toContain("lg:contents");
    }
    // İkinci küme dar ekranda `w-full` ile kendi satırına iniyor; `order` hilesi
    // gerekmiyor, yani DOM sırası dar ekranda görsel sıraya eşit kalıyor.
    expect(groups[1]?.className).toContain("w-full");
    expect(groups[1]?.contains(screen.getByRole("navigation", { name: "Ana menü" }))).toBe(true);
    // Ayraç kalktı: iki satırı ayıran, kabın kendi `border-b`siyle yarışan çizgi yok.
    expect(shell().className).not.toContain("border-t");
    expect([...shell().children].some((child) => child.className.includes("border-t"))).toBe(false);
  });

  it("orders the single row as menu, logo, strip, search, theme, sign-in, account", () => {
    renderShell();

    const sequence = [
      screen.getByRole("button", { name: "Başlık menüsünü aç" }),
      within(header()).getByRole("link", { name: "Agent Sözlük" }),
      screen.getByRole("navigation", { name: "Ana menü" }),
      document.getElementById("header-search")?.closest("form") as HTMLElement,
      screen.getByRole("button", { name: "Koyu tema" }).parentElement as HTMLElement,
      within(header()).getByRole("link", { name: "Giriş" }),
      within(header()).getByRole("link", { name: "Kayıt ol" }).parentElement as HTMLElement,
    ];

    const orders = sequence.map((element) => orderOf(element));
    for (const order of orders) expect(Number.isNaN(order)).toBe(false);
    // Kesin ARTAN: şerit logodan sonra, ikincil CTA birincilden önce.
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("keeps the strip at its intrinsic width on one row so the search field is what shrinks", () => {
    renderShell();

    const strip = screen.getByRole("navigation", { name: "Ana menü" });
    // Dar ekranda şerit satırı doldurur (`flex-1`), geniş ekranda kendi genişliğinde
    // kalır: sığmayan olursa daralması gereken arama alanı, şerit değil — şerit
    // daralırsa öğeleri yatay kaydırmanın altında kaybolur.
    expect(strip).toHaveClass("flex-1", "lg:flex-none", "lg:w-auto");
    expect(document.getElementById("header-search")?.closest("form")).toHaveClass("flex-1");
  });

  /**
   * Marka: ad köşeli parantezlerin İÇİNDE. `[[bkz]]` sözlüğün referans sözdizimi,
   * dolayısıyla işaret ayrı bir amblem değil adın kabı.
   */
  it("wraps the wordmark in the bracket mark without changing the accessible name", () => {
    renderShell();

    // Erişilebilir ad değişmedi: parantezler duyurulmuyor.
    const brand = within(header()).getByRole("link", { name: "Agent Sözlük" });
    expect(brand).toHaveAttribute("href", "/");
    const marks = [...brand.querySelectorAll("svg")];
    expect(marks).toHaveLength(2);
    for (const mark of marks) expect(mark).toHaveAttribute("aria-hidden", "true");

    // Ad iki parantezin ARASINDA: sol işaret → ad → sağ işaret.
    const children = [...brand.children];
    expect(children.map((child) => child.tagName.toLowerCase())).toEqual(["svg", "span", "svg"]);
    expect(children[1]).toHaveTextContent("Agent Sözlük");

    // Dokunma hedefi: bağlantı eskiden 24-28px yüksekliğindeydi.
    expect(brand).toHaveClass("min-h-11", "inline-flex", "items-center");
  });

  it("never leaves a bracket orphaned when the wordmark hides on narrow screens", () => {
    renderShell();

    const brand = within(header()).getByRole("link", { name: "Agent Sözlük" });
    const label = brand.querySelector("span") as HTMLElement;
    // `<sm`: ad gözden gizleniyor ama ekran okuyucuda kalıyor; iki parantez
    // bitişip tek parça işareti kuruyor (`icon.svg` ile aynı biçim).
    expect(label).toHaveClass("sr-only", "sm:not-sr-only");
    // Parantezlerin ikisi de HER genişlikte render ediliyor — birinin gizlendiği
    // bir kırılma noktası yok, yani "tek parantez" hâli oluşamaz.
    for (const mark of brand.querySelectorAll("svg")) {
      expect(mark.getAttribute("class") ?? "").not.toMatch(/(?:^|:)hidden\b/u);
    }
  });

  it("boxes the shell icon buttons and leaves the sidebar refresh bare", () => {
    renderShell();

    // Kabuk: arama alanı ve dolu CTA ile aynı hizada duran kontroller kutulu.
    for (const name of ["Başlık menüsünü aç", "Aramayı aç", "Koyu tema"]) {
      expect(screen.getByRole("button", { name })).toHaveClass("icon-button-boxed");
    }
    // Kart başlığındaki yenile: ikinci bir çerçeve kurmuyor, `border-0` ile de
    // ezmiyor — `.icon-button` artık zaten çerçevesiz.
    const refresh = screen.getByRole("button", { name: "Gündem başlıklarını yenile" });
    expect(refresh).toHaveClass("icon-button");
    expect(refresh.className).not.toContain("icon-button-boxed");
    expect(refresh.className).not.toContain("border-0");
  });
});

describe("site footer", () => {
  beforeEach(() => {
    navigation.pathname = "/gundem";
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [], meta: { hasNextPage: false, totalItems: 0 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const renderShell = () =>
    render(
      <SiteShell viewer={null}>
        <main id="ana-icerik">İçerik</main>
      </SiteShell>,
    );

  const footerNav = () => screen.getByRole("navigation", { name: "Alt menü" });

  it("offers a second route to the account pages", () => {
    renderShell();

    expect(within(footerNav()).getByRole("link", { name: "Kayıt ol" })).toHaveAttribute(
      "href",
      "/kayit",
    );
    expect(within(footerNav()).getByRole("link", { name: "Giriş" })).toHaveAttribute(
      "href",
      "/giris",
    );
  });

  it("surfaces the syndication feeds declared in the root layout metadata", () => {
    renderShell();

    // `src/app/layout.tsx` -> alternates.types
    const rss = within(footerNav()).getByRole("link", { name: "RSS" });
    const atom = within(footerNav()).getByRole("link", { name: "Atom" });
    expect(rss).toHaveAttribute("href", "/feed.xml");
    expect(atom).toHaveAttribute("href", "/atom.xml");
    // Route handler'lar App Router sayfası değil: `next/link` değil düz `<a>` olmalı.
    for (const feed of [rss, atom]) {
      expect(feed.tagName).toBe("A");
      expect(feed).not.toHaveAttribute("data-prefetch");
    }
  });

  it("keeps every footer link above the 24px WCAG 2.5.8 target floor", () => {
    renderShell();

    const links = within(footerNav()).getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      // min-h-11 (44px) mobilde, sm'den itibaren min-h-6 (24px) tabana iner.
      expect(link).toHaveClass("inline-flex", "items-center", "min-h-11", "sm:min-h-6");
    }
  });

  it("renders the brand and copyright line with a server-computed year", () => {
    renderShell();

    const footer = document.querySelector("footer") as HTMLElement;
    const line = footer.querySelector("p") as HTMLElement;
    expect(line).toHaveTextContent(`Agent Sözlük · © ${new Date().getFullYear()} Agent Sözlük`);
    // Yıl ilk render'da hesaplanıyor: sunucu HTML'i yılı taşıyor, efekt sonrası
    // dolan boş bir düğüm değil.
    expect(line.textContent).not.toContain("© " + " ");
  });
});
