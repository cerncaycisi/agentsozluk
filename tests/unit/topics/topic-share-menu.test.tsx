// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopicShareMenu } from "@/components/topics/topic-share-menu";
import { topicAiSharePrompt } from "@/components/share/share-links";

/**
 * Başlık seviyesindeki paylaşım — artık `⋮`'nin içinde DEĞİL, kendi ikonunun
 * arkasında (`docs/BENCHMARK_GIRISLI_2026-08-20.md` §2).
 */

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

const TOPIC = {
  title: "Güneşhamağı",
  url: "https://ornek.test/baslik/gunesamagi--7",
};

afterEach(() => {
  cleanup();
  toastSuccess.mockReset();
  toastError.mockReset();
  Reflect.deleteProperty(navigator, "clipboard");
});

function openShareMenu(): HTMLElement {
  const trigger = screen.getByRole("button", { name: "Başlığı paylaş" });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return trigger;
}

describe("başlık paylaşım menüsü", () => {
  it("kendi etiketli ikonu var ve başlık satırının komşularıyla aynı `chip` dilini konuşur", () => {
    render(<TopicShareMenu {...TOPIC} />);

    const trigger = screen.getByRole("button", { name: "Başlığı paylaş" });
    // Takip düğmesi ve ⋮ de `chip`; paylaşım onların yanında çerçevesiz durmamalı.
    expect(trigger.className).toContain("chip");
    expect(trigger.className).toContain("w-9");
  });

  it("dört yapay zekâ kanalını üstte, üç sosyal kanalı altta, kopyalamayı sonda verir", async () => {
    render(<TopicShareMenu {...TOPIC} />);
    openShareMenu();

    expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual([
      "ChatGPT",
      "Claude",
      "Perplexity",
      "Grok",
      "X",
      "Facebook",
      "WhatsApp",
      "Linki kopyala",
    ]);
  });

  it("yapay zekâ kanallarına başlığın gerçek yazımını taşıyan prompt'u verir", async () => {
    render(<TopicShareMenu {...TOPIC} />);
    openShareMenu();

    const aiGroup = await screen.findByRole("group", { name: "Yapay zekâya sor" });
    const channels = [...aiGroup.querySelectorAll("a")];
    expect(channels).toHaveLength(4);
    for (const channel of channels) {
      const query = new URL(channel.getAttribute("href") ?? "").searchParams;
      expect(query.get("q") ?? query.get("text")).toBe(topicAiSharePrompt(TOPIC));
    }
  });

  it("sosyal kanallara MUTLAK adresi ve başlık metnini taşır", async () => {
    render(<TopicShareMenu {...TOPIC} />);
    openShareMenu();

    const socialGroup = await screen.findByRole("group", { name: "Sosyal ağlarda paylaş" });
    for (const channel of socialGroup.querySelectorAll("a")) {
      const href = channel.getAttribute("href") ?? "";
      // Göreli bir `/baslik/...` paylaşıldığında hiçbir yere gitmez; taşınan
      // değer kökenle birlikte, yüzde kodlanmış olmalı.
      expect(href).toContain(encodeURIComponent(TOPIC.url));
      expect(decodeURIComponent(href)).not.toMatch(/=\/baslik\//u);
      expect(new URL(href).protocol).toBe("https:");
    }
    const x = screen.getByRole("menuitem", { name: "X" });
    expect(new URL(x.getAttribute("href") ?? "").searchParams.get("text")).toBe(TOPIC.title);
  });

  it("linki panoya mutlak olarak yazar", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<TopicShareMenu {...TOPIC} />);

    openShareMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Linki kopyala" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TOPIC.url));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Link kopyalandı."));
  });

  it("pano yoksa yedek kutuyu başlık satırını taşırmadan, tetikleyicinin altında açar", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    render(<TopicShareMenu {...TOPIC} />);

    openShareMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Linki kopyala" }));

    const input = await screen.findByLabelText("Pano kullanılamadı; linki buradan kopyalayın");
    expect(input).toHaveValue(TOPIC.url);
    // Kimlik satırı sarmıyor: kutu akışta yer kaplarsa satırı bozar.
    expect(input.closest("div")?.className).toContain("absolute");
    await waitFor(() => expect(toastError).toHaveBeenCalled());
  });

  it("klavyeyle gezilir ve Esc odağı tetikleyiciye döndürür", async () => {
    const user = userEvent.setup();
    render(<TopicShareMenu {...TOPIC} />);

    const trigger = screen.getByRole("button", { name: "Başlığı paylaş" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const items = await screen.findAllByRole("menuitem");
    await waitFor(() => expect(items[0]).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menuitem")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("harici script yüklemez", () => {
    const { container } = render(<TopicShareMenu {...TOPIC} />);

    expect(container.querySelector("script")).toBeNull();
    expect(document.querySelectorAll("script[src]")).toHaveLength(0);
  });
});
