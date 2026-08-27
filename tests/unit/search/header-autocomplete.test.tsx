// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchAutocomplete } from "@/components/search/search-autocomplete";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navigation.push }) }));

const suggestions = {
  topics: [
    { title: "yapay zekâ ile gündelik hayat", url: "/baslik/yapay-zeka-ile-gundelik-hayat--1" },
    { title: "yağmurlu havada yapılacaklar", url: "/baslik/yagmurlu-havada-yapilacaklar--15" },
  ],
  users: [{ username: "meraklibaykus", url: "/yazar/meraklibaykus" }],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderSearch() {
  return render(<SearchAutocomplete inputId="header-search" className="w-full" />);
}

const input = () => screen.getByRole("combobox", { name: "Sözlükte ara" });

const suggestCalls = () =>
  vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/search/suggest"));

describe("header search autocomplete", () => {
  beforeEach(() => {
    navigation.push.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(suggestions)));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps working as a plain /ara form so it survives without JavaScript", () => {
    renderSearch();

    const form = input().closest("form");
    expect(form).toHaveAttribute("action", "/ara");
    expect(form).toHaveAttribute("role", "search");
    expect(input()).toHaveAttribute("name", "q");
    expect(input()).toHaveAttribute("aria-autocomplete", "list");
    expect(input()).toHaveAttribute("aria-controls", "header-search-oneriler");
    expect(input()).toHaveAttribute("aria-expanded", "false");
  });

  it("renders a plain search field before hydration", () => {
    // JavaScript çalışmayan sayfada hiç açılmayacak bir listeyi işaret eden
    // combobox duyurulmamalı; geriye sıradan bir `/ara` formu kalır.
    const markup = renderToStaticMarkup(
      <SearchAutocomplete inputId="header-search" className="w-full" />,
    );

    expect(markup).toContain('action="/ara"');
    expect(markup).toContain('name="q"');
    expect(markup).not.toContain('role="combobox"');
    expect(markup).not.toContain('role="listbox"');
    expect(markup).not.toContain("aria-expanded");
  });

  it("stays quiet below two characters and debounces the request", async () => {
    renderSearch();

    fireEvent.change(input(), { target: { value: "y" } });
    await new Promise((resolve) => setTimeout(resolve, 260));
    expect(suggestCalls()).toHaveLength(0);

    fireEvent.change(input(), { target: { value: "ya" } });
    // Debounce dolmadan istek çıkmaz.
    expect(suggestCalls()).toHaveLength(0);

    await waitFor(() => expect(suggestCalls()).toHaveLength(1));
    expect(suggestCalls()[0]?.[0]).toBe("/api/v1/search/suggest?q=ya");
  });

  it("sends one request for a burst of keystrokes and aborts the one in flight", async () => {
    let resolveFirst: ((value: Response) => void) | undefined;
    vi.mocked(fetch)
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(jsonResponse(suggestions));
    renderSearch();

    // Debounce içinde kalan dört tuş vuruşu tek isteğe iner.
    for (const value of ["y", "ya", "yap", "yapa"]) {
      fireEvent.change(input(), { target: { value } });
    }
    await waitFor(() => expect(suggestCalls()).toHaveLength(1));
    expect(suggestCalls()[0]?.[0]).toBe("/api/v1/search/suggest?q=yapa");

    // İstek uçarken yazmaya devam: önceki istek iptal edilir.
    const firstSignal = (suggestCalls()[0]?.[1] as RequestInit | undefined)?.signal;
    expect(firstSignal?.aborted).toBe(false);
    fireEvent.change(input(), { target: { value: "yapay" } });
    await waitFor(() => expect(firstSignal?.aborted).toBe(true));
    await waitFor(() => expect(suggestCalls()).toHaveLength(2));
    resolveFirst?.(jsonResponse(suggestions));
  });

  it("groups topics and authors and announces how many arrived", async () => {
    const user = userEvent.setup();
    renderSearch();

    await user.click(input());
    await user.keyboard("ya");

    const listbox = await screen.findByRole("listbox", { name: "Arama önerileri" });
    expect(input()).toHaveAttribute("aria-expanded", "true");

    const topicGroup = within(listbox).getByRole("group", { name: "Başlıklar" });
    const userGroup = within(listbox).getByRole("group", { name: "Yazarlar" });
    expect(within(topicGroup).getAllByRole("option")).toHaveLength(2);
    expect(within(userGroup).getAllByRole("option")).toHaveLength(1);
    expect(within(topicGroup).getAllByRole("option")[0]).toHaveAttribute(
      "href",
      "/baslik/yapay-zeka-ile-gundelik-hayat--1",
    );
    expect(within(userGroup).getByRole("option")).toHaveTextContent("meraklibaykus");
    expect(screen.getByRole("status")).toHaveTextContent("2 başlık, 1 yazar önerisi.");
  });

  it("walks the list with the arrow keys while focus stays in the input", async () => {
    const user = userEvent.setup();
    renderSearch();

    await user.click(input());
    await user.keyboard("ya");
    await screen.findByRole("listbox");
    expect(input()).not.toHaveAttribute("aria-activedescendant");

    await user.keyboard("{ArrowDown}");
    expect(input()).toHaveFocus();
    expect(input()).toHaveAttribute("aria-activedescendant", "header-search-baslik-0");
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(input()).toHaveAttribute("aria-activedescendant", "header-search-yazar-0");

    // Son öğeden sonra döngü input'a geri uğrar.
    await user.keyboard("{ArrowDown}");
    expect(input()).not.toHaveAttribute("aria-activedescendant");

    // Yukarı ok son öğeye sarar.
    await user.keyboard("{ArrowUp}");
    expect(input()).toHaveAttribute("aria-activedescendant", "header-search-yazar-0");
  });

  it("follows the active option on Enter and closes on Escape", async () => {
    const user = userEvent.setup();
    renderSearch();

    await user.click(input());
    await user.keyboard("ya");
    await screen.findByRole("listbox");

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(navigation.push).toHaveBeenCalledWith("/baslik/yagmurlu-havada-yapilacaklar--15");
    expect(input()).toHaveAttribute("aria-expanded", "false");

    await user.keyboard("{ArrowDown}");
    expect(input()).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(input()).not.toHaveAttribute("aria-activedescendant");
    expect(input()).toHaveFocus();
  });

  it("submits the form normally when no option carries the virtual focus", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <div onSubmit={onSubmit}>
        <SearchAutocomplete inputId="header-search" className="w-full" />
      </div>,
    );

    await user.click(input());
    await user.keyboard("ya");
    await screen.findByRole("listbox");
    await user.keyboard("{Enter}");

    expect(navigation.push).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("offers to open a new topic when nothing matches", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ topics: [], users: [] }));
    const user = userEvent.setup();
    renderSearch();

    await user.click(input());
    await user.keyboard("zzzq");

    const option = await screen.findByRole("option", { name: "«zzzq» başlığını aç" });
    expect(option).toHaveAttribute("href", "/baslik/zzzq");
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Eşleşen başlık veya yazar yok; yeni başlık açabilirsiniz.",
    );

    await user.keyboard("{ArrowDown}{Enter}");
    expect(navigation.push).toHaveBeenCalledWith("/baslik/zzzq");
  });

  it("percent-encodes the proposed title", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ topics: [], users: [] }));
    const user = userEvent.setup();
    renderSearch();

    await user.click(input());
    await user.keyboard("açık kaynak & co");

    const option = await screen.findByRole("option", { name: /başlığını aç/u });
    expect(option).toHaveAttribute("href", `/baslik/${encodeURIComponent("açık kaynak & co")}`);
  });

  it("falls silent on a rate limited response instead of showing an error", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ error: { code: "RATE_LIMITED", message: "Çok fazla istek." } }, 429),
    );
    const user = userEvent.setup();
    renderSearch();

    await user.click(input());
    await user.keyboard("ya");

    await waitFor(() => expect(suggestCalls()).toHaveLength(1));
    await waitFor(() => expect(input()).toHaveAttribute("aria-expanded", "false"));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByText(/istek/iu)).toBeNull();
    // Form hâlâ normal submit ediyor.
    expect(input().closest("form")).toHaveAttribute("action", "/ara");
  });

  it("closes the list when the query drops below two characters", async () => {
    const user = userEvent.setup();
    renderSearch();

    await user.click(input());
    await user.keyboard("ya");
    await screen.findByRole("listbox");

    await user.keyboard("{Backspace}");
    await waitFor(() => expect(input()).toHaveAttribute("aria-expanded", "false"));
    expect(suggestCalls()).toHaveLength(1);
  });
});
