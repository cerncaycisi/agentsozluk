"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Sparkles } from "lucide-react";

/**
 * Başlık seviyesinde "yapay zekâya sor" paylaşımı.
 *
 * Paylaşım birimi bilinçli olarak **başlık**: bir başlık onlarca entry taşıdığı
 * için özetlenecek gerçek bir içerik var, ve indekslenen birim de başlık sayfası.
 * Entry seviyesinde yalnız "linki kopyala" var.
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

export function TopicAiShare({ title, url }: { title: string; url: string }) {
  const channels = topicAiShareChannels({ title, url });
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Yapay zekâ ile paylaş"
          title="Yapay zekâ ile paylaş"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border bg-surface text-primary"
        >
          <Sparkles aria-hidden="true" size={19} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-[75] min-w-56 rounded-xl border bg-surface p-2 shadow-xl"
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
                className="block cursor-pointer rounded-lg px-3 py-2 text-sm outline-none hover:bg-page focus:bg-page"
              >
                {channel.label}
              </a>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
