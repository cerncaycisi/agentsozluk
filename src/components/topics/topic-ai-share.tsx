"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronRight, Share2 } from "lucide-react";

/**
 * Başlık seviyesinde "yapay zekâya sor" paylaşımı.
 *
 * Paylaşım birimi bilinçli olarak **başlık**: bir başlık onlarca entry taşıdığı
 * için özetlenecek gerçek bir içerik var, ve indekslenen birim de başlık sayfası.
 * Entry seviyesinde yalnız "linki kopyala" var.
 *
 * Menü artık kendi ✨ tetikleyicisini taşımıyor: başlık üstündeki etiketsiz ikon
 * ne olduğunu söylemiyordu ve satırın gürültüsünü artırıyordu. Paylaşım, başlık
 * sayfasının ⋮ menüsünde "Paylaş" etiketli bir alt menü olarak yaşıyor
 * (`topic-overflow-menu.tsx`).
 *
 * Dört kanalın hepsi düz `<a href>`. Hiçbir harici script yüklenmiyor, hiçbir
 * kanal SDK'sı çağrılmıyor; tıklama yeni sekmede hedef aracın kendi sayfasını
 * açar ve prompt'u sorgu parametresiyle taşır.
 *
 * `rel="nofollow noopener noreferrer"`: bu linkler editoryal bir tavsiye değil
 * (nofollow), ve hedef sayfaya `window.opener` / referrer sızdırmıyoruz.
 */

const CHANNELS = [
  { id: "chatgpt", label: "ChatGPT", base: "https://chat.openai.com/?q=" },
  { id: "claude", label: "Claude", base: "https://claude.ai/new?q=" },
  { id: "perplexity", label: "Perplexity", base: "https://www.perplexity.ai/search/new?q=" },
  { id: "grok", label: "Grok", base: "https://x.com/i/grok?text=" },
] as const;

export type TopicAiShareChannel = {
  id: (typeof CHANNELS)[number]["id"];
  label: string;
  href: string;
};

/**
 * Prompt başlığı da taşır: başlık sayfasının URL'i her zaman ASCII'ye
 * dönüştürülmüş bir slug'tır (`createTopicSlug` Türkçe harfleri düşürür), yani
 * yalnız URL gönderilseydi hedef araç başlığın gerçek yazımını hiç görmezdi.
 */
export function topicAiSharePrompt(input: { title: string; url: string }): string {
  return `Bu URL’yi ziyaret et ve “${input.title}” başlığındaki entry’lerde savunulan görüşleri özetle: ${input.url}`;
}

export function topicAiShareChannels(input: {
  title: string;
  url: string;
}): readonly TopicAiShareChannel[] {
  const prompt = encodeURIComponent(topicAiSharePrompt(input));
  return CHANNELS.map((channel) => ({
    id: channel.id,
    label: channel.label,
    href: `${channel.base}${prompt}`,
  }));
}

/**
 * ⋮ menüsünün "Paylaş" alt menüsü. Radix `Sub` kullanılıyor: klavyede sağ ok /
 * Enter açar, sol ok / Esc kapatır, oklarla kanallar arasında gezilir.
 */
export function TopicShareSubmenu({ title, url }: { title: string; url: string }) {
  const channels = topicAiShareChannels({ title, url });
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className="menu-item">
        <Share2 aria-hidden="true" size={16} />
        Paylaş
        <ChevronRight aria-hidden="true" size={14} className="ml-auto text-muted" />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent
          sideOffset={4}
          alignOffset={-4}
          className="z-[75] min-w-52 rounded-lg border bg-surface p-2"
        >
          <DropdownMenu.Label className="px-3 py-2 text-xs font-medium text-muted">
            Bu başlığı yapay zekâya özetlet
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 border-t" />
          {channels.map((channel) => (
            <DropdownMenu.Item key={channel.id} asChild>
              <a
                href={channel.href}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="menu-item"
              >
                {channel.label}
              </a>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}
