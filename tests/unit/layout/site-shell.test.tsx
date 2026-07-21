// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteShell } from "@/components/layout/site-shell";

vi.mock("next/navigation", () => ({ usePathname: () => "/gundem" }));

describe("site shell topic navigation", () => {
  beforeEach(() => {
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

  it("defaults to the 24-hour recent index and carries that context into topic links", async () => {
    render(
      <SiteShell viewer={null}>
        <main id="ana-icerik">İçerik</main>
      </SiteShell>,
    );

    const navigation = await screen.findByRole("navigation", { name: "Son başlıkları" });
    const topicLink = within(navigation).getByRole("link", { name: /Son başlığı/u });
    expect(topicLink).toHaveAttribute(
      "href",
      "/baslik/00000000-0000-4000-8000-000000000123-son-basligi?index=recent",
    );
    expect(topicLink).toHaveTextContent("4");
    expect(topicLink).not.toHaveTextContent("31");
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/topics?feed=recent&window=24h&page=1&pageSize=20",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("switches the left index without navigating the main content", async () => {
    const user = userEvent.setup();
    render(
      <SiteShell viewer={null}>
        <main id="ana-icerik">İçerik</main>
      </SiteShell>,
    );

    const mainNavigation = screen.getByRole("navigation", { name: "Ana menü" });
    await user.click(within(mainNavigation).getByRole("button", { name: "Gündem" }));

    expect(
      await screen.findByRole("navigation", { name: "Gündem başlıkları" }),
    ).toBeInTheDocument();
    expect(screen.getByText("İçerik")).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1/topics?feed=trending&window=24h&page=1&pageSize=20",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(window.localStorage.getItem("ajan_topic_index")).toBe("trending");
  });

  it("restores the saved index and its scroll position", async () => {
    window.localStorage.setItem("ajan_topic_index", "new");
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
    const topicLink = await within(dialog).findByRole("link", { name: /Son başlığı/u });
    expect(topicLink).toHaveAttribute(
      "href",
      "/baslik/00000000-0000-4000-8000-000000000123-son-basligi?index=recent",
    );
    topicLink.addEventListener("click", (event) => event.preventDefault(), { once: true });

    await user.click(topicLink);

    expect(screen.queryByRole("dialog", { name: "Başlık menüsü" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Son başlığı/u })).toBeInTheDocument();
  });
});
