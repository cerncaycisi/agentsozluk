import { describe, expect, it } from "vitest";
import {
  aiShareChannels,
  entryAiSharePrompt,
  socialShareChannels,
  topicAiSharePrompt,
} from "@/components/share/share-links";

/**
 * Paylaşım adreslerinin tek gereksinimi var: doğru hedef, doğru metin, MUTLAK
 * adres — ve hepsi düz bir `href` dizgesi, yani hiçbir kanal SDK'sı yok.
 *
 * Şablonlar tarayıcıda tek tek açılıp doğrulandı; hangi adresin ne yaptığı
 * `share-links.ts` başındaki tabloda.
 */

const TOPIC = {
  title: "Güneşhamağı",
  url: "https://ornek.test/baslik/gunesamagi--7",
};
const ENTRY_URL = "https://ornek.test/entry/951";

describe("yapay zekâ prompt'ları", () => {
  it("başlık prompt'u başlığın gerçek yazımını taşır", () => {
    // URL slug'ı ASCII'ye düşürülmüş olduğu için başlığın Türkçe yazımı yalnız
    // prompt metninde taşınabilir.
    expect(topicAiSharePrompt(TOPIC)).toBe(
      "Bu URL’yi ziyaret et ve “Güneşhamağı” başlığındaki entry’lerde savunulan görüşleri özetle: https://ornek.test/baslik/gunesamagi--7",
    );
  });

  it("entry prompt'u başlıktan farklı bir iş ister", () => {
    // Tek bir entry'de "özetlenecek tartışma" yok; değerli olan karşı argüman.
    expect(entryAiSharePrompt({ url: ENTRY_URL })).toBe(
      "Bu URL’deki sözlük entry’sini oku; savunduğu görüşü ve karşısına konabilecek argümanları özetle: https://ornek.test/entry/951",
    );
  });
});

describe("yapay zekâ kanalları", () => {
  it("dört kanalın da doğrulanmış şablonunu kullanır", () => {
    expect(
      aiShareChannels(topicAiSharePrompt(TOPIC)).map((channel) => [
        channel.id,
        channel.label,
        channel.href.split("?")[0] + (channel.id === "grok" ? "?text=" : "?q="),
      ]),
    ).toEqual([
      ["chatgpt", "ChatGPT", "https://chatgpt.com/?q="],
      ["claude", "Claude", "https://claude.ai/new?q="],
      ["perplexity", "Perplexity", "https://www.perplexity.ai/search/new?q="],
      ["grok", "Grok", "https://x.com/i/grok?text="],
    ]);
  });

  it("Türkçe karakterleri ve tırnakları yüzde kodlar, ayırıcı karakter sızdırmaz", () => {
    const [chatgpt] = aiShareChannels(topicAiSharePrompt(TOPIC));
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
    const prompt = topicAiSharePrompt(tricky);
    const claude = aiShareChannels(prompt).find((channel) => channel.id === "claude");
    expect(new URL(claude?.href ?? "").searchParams.get("q")).toBe(prompt);
  });

  it("her kanal mutlak `https` adresi verir", () => {
    for (const channel of aiShareChannels(entryAiSharePrompt({ url: ENTRY_URL }))) {
      expect(new URL(channel.href).protocol).toBe("https:");
      expect(channel.href).toContain(encodeURIComponent(ENTRY_URL));
    }
  });
});

/**
 * Kanal listesi ölçümle geldi (`docs/BENCHMARK_GIRISLI_2026-08-20.md` §2):
 * çekirdek üçlü (kopyala + X + Facebook) iki kıyasta da var, WhatsApp yalnız
 * Normal Sözlük'te ama Türkiye'de link gönderiminin fiilî varsayılanı. Telegram,
 * Bluesky ve LinkedIn bilerek DIŞARIDA — ilk ikisi yalnız birer kıyasta geçiyor,
 * LinkedIn hiçbirinde yok.
 */
describe("sosyal kanallar", () => {
  it("yalnız X, Facebook ve WhatsApp taşır — LinkedIn, Telegram, Bluesky yok", () => {
    expect(socialShareChannels({ url: TOPIC.url }).map((channel) => channel.id)).toEqual([
      "x",
      "facebook",
      "whatsapp",
    ]);
  });

  it("adresi her kanalda yüzde kodlanmış olarak taşır", () => {
    for (const channel of socialShareChannels({ url: TOPIC.url, text: TOPIC.title })) {
      // Adres sorgu değerinin İÇİNDE; ham `:` ve `/` sızarsa hedef kırpar.
      expect(channel.href).toContain(encodeURIComponent(TOPIC.url));
      expect(new URL(channel.href).protocol).toBe("https:");
    }
  });

  it("X'e hem adresi hem metni verir, güncel niyet adresini kullanır", () => {
    const x = socialShareChannels({ url: TOPIC.url, text: TOPIC.title })[0];
    const parsed = new URL(x?.href ?? "");
    expect(parsed.origin + parsed.pathname).toBe("https://x.com/intent/post");
    expect(parsed.searchParams.get("url")).toBe(TOPIC.url);
    expect(parsed.searchParams.get("text")).toBe(TOPIC.title);
  });

  it("metin yokken X yalnız adresi taşır, boş bir metin parametresi bırakmaz", () => {
    const parsed = new URL(socialShareChannels({ url: ENTRY_URL })[0]?.href ?? "");
    expect(parsed.searchParams.get("url")).toBe(ENTRY_URL);
    expect(parsed.searchParams.has("text")).toBe(false);
  });

  it("Facebook yalnız adres alır — paylaşım metnini zaten yok sayıyor", () => {
    const parsed = new URL(
      socialShareChannels({ url: TOPIC.url, text: TOPIC.title })[1]?.href ?? "",
    );
    expect(parsed.origin + parsed.pathname).toBe("https://www.facebook.com/sharer/sharer.php");
    expect(parsed.searchParams.get("u")).toBe(TOPIC.url);
    expect([...parsed.searchParams.keys()]).toEqual(["u"]);
  });

  it("WhatsApp metni ve adresi tek alanda birleştirir, boşluğu `+` ile kodlamaz", () => {
    const whatsapp = socialShareChannels({ url: TOPIC.url, text: TOPIC.title })[2];
    expect(whatsapp?.href.startsWith("https://wa.me/?text=")).toBe(true);
    const raw = whatsapp?.href.split("?text=")[1] ?? "";
    // `+` bazı WhatsApp istemcilerinde artı işareti olarak görünüyor; `%20` şart.
    expect(raw).not.toContain("+");
    expect(decodeURIComponent(raw)).toBe(`${TOPIC.title} ${TOPIC.url}`);
  });

  it("metin yokken WhatsApp yalnız adresi taşır", () => {
    const raw = socialShareChannels({ url: ENTRY_URL })[2]?.href.split("?text=")[1] ?? "";
    expect(decodeURIComponent(raw)).toBe(ENTRY_URL);
  });

  it("yalnız boşluktan oluşan metni yok sayar", () => {
    const parsed = new URL(socialShareChannels({ url: ENTRY_URL, text: "   " })[0]?.href ?? "");
    expect(parsed.searchParams.has("text")).toBe(false);
  });
});
