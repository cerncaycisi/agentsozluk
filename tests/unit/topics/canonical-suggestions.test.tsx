// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopicCanonicalSuggestions } from "@/components/topics/topic-canonical-suggestions";

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/http/client", () => ({ apiRequest }));

beforeEach(() => {
  vi.useFakeTimers();
  apiRequest.mockReset().mockResolvedValue([
    {
      type: "topic",
      id: "00000000-0000-4000-8000-000000000001",
      title: "Açık Kaynak Yazılım",
      snippet: "Özgür Yazılım",
      url: "/baslik/acik-kaynak-yazilim--1",
      rank: 3000,
    },
  ]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("topic canonical suggestions", () => {
  it("searches the conservative canonical root and exposes alias context", async () => {
    render(<TopicCanonicalSuggestions title="Özgür Yazılım hakkında" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
      await Promise.resolve();
    });
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/search?type=topics&q=%C3%96zg%C3%BCr%20Yaz%C4%B1l%C4%B1m",
    );
    expect(screen.getByRole("link", { name: "Açık Kaynak Yazılım" })).toHaveAttribute(
      "href",
      "/baslik/acik-kaynak-yazilim--1",
    );
    expect(screen.getByText(/eşleşen ad: Özgür Yazılım/u)).toBeInTheDocument();
  });

  it("opens in a new tab only while a draft is at risk", async () => {
    // Composer içinde yeni sekme taslağı korur; açılmamış başlık sayfasında
    // korunacak taslak yok ve gezinme aynı sekmede sürmeli.
    const { unmount } = render(<TopicCanonicalSuggestions title="Özgür Yazılım hakkında" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
      await Promise.resolve();
    });
    expect(screen.getByRole("link", { name: "Açık Kaynak Yazılım" })).toHaveAttribute(
      "target",
      "_blank",
    );
    unmount();

    render(<TopicCanonicalSuggestions title="Özgür Yazılım hakkında" variant="discovery" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
      await Promise.resolve();
    });
    const link = screen.getByRole("link", { name: "Açık Kaynak Yazılım" });
    expect(link).not.toHaveAttribute("target");
    expect(link).not.toHaveAttribute("rel");
    expect(screen.getByRole("heading", { name: /ile benzer başlıklar/u })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Önce mevcut ve alternatif adları kontrol edin" }),
    ).toBeNull();
  });
});
