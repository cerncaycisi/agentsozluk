// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteShell } from "@/components/layout/site-shell";

vi.mock("next/navigation", () => ({ usePathname: () => "/gundem" }));

describe("site shell topic navigation", () => {
  beforeEach(() => {
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
        new Response(
          JSON.stringify({
            data: [
              {
                id: "00000000-0000-4000-8000-000000000123",
                title: "Mobil gündem başlığı",
                slug: "mobil-gundem-basligi",
                entryCount: 3,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("closes the mobile drawer when a topic is selected", async () => {
    const user = userEvent.setup();
    render(
      <SiteShell viewer={null}>
        <main id="ana-icerik">İçerik</main>
      </SiteShell>,
    );

    const trigger = screen.getByRole("button", { name: "Gündem menüsünü aç" });
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Gündemdeki başlıklar" });
    const topicLink = await within(dialog).findByRole("link", { name: /Mobil gündem başlığı/u });
    expect(topicLink).toHaveAttribute(
      "href",
      "/baslik/00000000-0000-4000-8000-000000000123-mobil-gundem-basligi",
    );
    topicLink.addEventListener("click", (event) => event.preventDefault(), { once: true });

    await user.click(topicLink);

    expect(screen.queryByRole("dialog", { name: "Gündemdeki başlıklar" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Mobil gündem başlığı/u })).toBeInTheDocument();
  });
});
