// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteShell } from "@/components/layout/site-shell";

const navigation = vi.hoisted(() => ({ pathname: "/gundem" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

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
