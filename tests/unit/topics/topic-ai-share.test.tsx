// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  TopicAiShare,
  topicAiSharePrompt,
  topicAiShareChannels,
} from "@/components/topics/topic-ai-share";

/**
 * Başlık seviyesindeki yapay zekâ paylaşımı.
 *
 * Dört kanalın da tek gereksinimi var: doğru araç, doğru prompt, mutlak URL —
 * ve hepsi düz `<a href>`, yani hiçbir harici script yüklenmiyor.
 *
 * `claude.ai/new?q=` deseni uygulama öncesi elle doğrulandı: claude.ai üretim
 * paketinde `/new` rotası `q` parametresini tanınan URL parametreleri arasında
 * sayıyor ve composer'ı onunla dolduruyor.
 */

const TOPIC = {
  title: "Güneşhamağı",
  url: "https://ornek.test/baslik/gunesamagi--7",
};

afterEach(cleanup);

describe("topic ai share prompt", () => {
  it("başlığın gerçek yazımını prompt'a koyar", () => {
    // URL slug'ı ASCII'ye düşürülmüş olduğu için başlığın Türkçe yazımı yalnız
    // prompt metninde taşınabilir.
    expect(topicAiSharePrompt(TOPIC)).toBe(
      "Bu URL’yi ziyaret et ve “Güneşhamağı” başlığındaki entry’lerde savunulan görüşleri özetle: https://ornek.test/baslik/gunesamagi--7",
    );
  });

  it("Türkçe karakterleri ve tırnakları yüzde kodlar, ayırıcı karakter sızdırmaz", () => {
    const [chatgpt] = topicAiShareChannels(TOPIC);
    const query = chatgpt?.href.split("?q=")[1] ?? "";
    expect(query).not.toBe("");
    // Sorgu değerinin içinde ham `&`, `=`, `#`, boşluk ya da ASCII olmayan
    // karakter kalmamalı; yoksa prompt hedef araçta kırpılır.
    expect(query).toMatch(/^[A-Za-z0-9\-._~%!'()*]+$/u);
    expect(decodeURIComponent(query)).toBe(topicAiSharePrompt(TOPIC));
    expect(query).toContain("G%C3%BCne%C5%9Fhama%C4%9F%C4%B1");
  });

  it("başlıkta ayırıcı karakter olsa bile prompt bozulmaz", () => {
    const tricky = { title: "a&b=c#d ?e", url: "https://ornek.test/baslik/a-b-c-d-e--9" };
    const claude = topicAiShareChannels(tricky).find((channel) => channel.id === "claude");
    const parsed = new URL(claude?.href ?? "");
    expect(parsed.searchParams.get("q")).toBe(topicAiSharePrompt(tricky));
  });

  it("dört kanalın da doğrulanmış şablonunu kullanır", () => {
    expect(
      topicAiShareChannels(TOPIC).map((channel) => [
        channel.id,
        channel.href.split("?")[0] + (channel.id === "grok" ? "?text=" : "?q="),
      ]),
    ).toEqual([
      ["chatgpt", "https://chat.openai.com/?q="],
      ["claude", "https://claude.ai/new?q="],
      ["perplexity", "https://www.perplexity.ai/search/new?q="],
      ["grok", "https://x.com/i/grok?text="],
    ]);
  });
});

describe("topic ai share menu", () => {
  it("klavyeyle açılır, dört kanalı yeni sekmeye açan link olarak verir ve Esc kapatır", async () => {
    const user = userEvent.setup();
    render(<TopicAiShare {...TOPIC} />);

    const trigger = screen.getByRole("button", { name: "Yapay zekâ ile paylaş" });
    trigger.focus();
    await user.keyboard("{Enter}");

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "ChatGPT",
      "Claude",
      "Perplexity",
      "Grok",
    ]);
    for (const item of items) {
      expect(item.tagName).toBe("A");
      expect(item).toHaveAttribute("target", "_blank");
      expect(item).toHaveAttribute("rel", "nofollow noopener noreferrer");
    }

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("harici script yüklemez", () => {
    const { container } = render(<TopicAiShare {...TOPIC} />);
    expect(container.querySelector("script")).toBeNull();
    expect(document.querySelectorAll("script[src]")).toHaveLength(0);
  });
});
