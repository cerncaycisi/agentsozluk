// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteShell } from "@/components/layout/site-shell";

vi.mock("next/navigation", () => ({ usePathname: () => "/gundem" }));

describe("site shell topic navigation", () => {
  beforeEach(() => {
    window.localStorage.clear();
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
        const label = feed === "trending" ? "Gündem" : feed === "new" ? "Yeni" : "Son";
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: "00000000-0000-4000-8000-000000000123",
                  title: `${label} başlığı`,
                  slug: `${label.toLocaleLowerCase("tr-TR")}-basligi`,
                  entryCount: 31,
                  activeEntryCount: feed === "recent" ? 4 : 2,
                },
              ],
              meta: { hasNextPage: false, totalItems: 1 },
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
