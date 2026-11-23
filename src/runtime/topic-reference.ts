import type { SafeSourceReader, SourceReadOptions } from "@/runtime/source-reader";

/*
  Başlık bilgisi (23 Kasım 2026, Gökhan: "olur"). Yazar bir başlığa yazmadan önce o başlığın
  Vikipedi giriş bölümünü kısa bir bilgi notu olarak görür. Yerel kör okumalarda başlığa özgü
  bilgiyle yazan Claude canlı yönteme göre önde çıktı (Opus 3,63 / luna 3,00; Sonnet 3,50 / 3,13);
  bilgi yokken iki model de aynı puanı aldı. Bkz `entry-writer.ts`.

  Okuma `SafeSourceReader.readHtml` ile yapılır: aynı SSRF, robots.txt, boyut ve süre kapıları.
  Vikipedi robots.txt'i `/w/` ve `/api/` yollarını kapatıyor, `/wiki/<ad>` açık; bu yüzden makale
  sayfası `?action=render` ile (yalnız gövde HTML'i) okunur. Önce Türkçe, yoksa İngilizce.

  Not kanıt kaydına girmez (algı anlık görüntüsünde yok); yalnız yazım isteminde bilgi notudur.
  Her hata ya da eksik sayfa `null` döner; yazar notsuz yazar.
*/

export const topicReferenceLanguages = ["tr", "en"] as const;
export type TopicReferenceLanguage = (typeof topicReferenceLanguages)[number];

export interface TopicReference {
  lang: TopicReferenceLanguage;
  url: string;
  text: string;
}

/** Bilgi notunun üst sınırı; yerel denemedeki giriş bölümleri 500–2.600 karakterdi. */
export const topicReferenceMaxChars = 2_400;
/** Bundan kısa giriş bilgi notu sayılmaz (taslak sayfa, yönlendirme artığı). */
export const topicReferenceMinChars = 200;

export function wikipediaRenderUrl(lang: TopicReferenceLanguage, title: string): string {
  const name = title.trim().replaceAll(/\s+/gu, "_");
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(name)}?action=render`;
}

function decodeEntities(value: string): string {
  return value
    .replaceAll(/&nbsp;|&#160;/giu, " ")
    .replaceAll(/&lt;/giu, "<")
    .replaceAll(/&gt;/giu, ">")
    .replaceAll(/&quot;/giu, '"')
    .replaceAll(/&#39;|&apos;/giu, "'")
    .replaceAll(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replaceAll(/&#x([0-9a-f]+);/giu, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replaceAll(/&amp;/giu, "&");
}

function removeElements(html: string, tag: string): string {
  // İç içe tabloları içten dışa siler; düz bir tembel eşleşme dış tablonun yarısını bırakırdı.
  const innermost = new RegExp(`<${tag}\\b[^>]*>(?:(?!<${tag}\\b)[\\s\\S])*?</${tag}>`, "giu");
  let previous: string;
  let current = html;
  do {
    previous = current;
    current = current.replaceAll(innermost, " ");
  } while (current !== previous);
  return current;
}

/**
 * Anlam ayrımı sayfası bilgi notu değildir. `mw-disambig` sınıfı yalnız anlam ayrımı sayfasına
 * giden BAĞLANTILARDA da bulunduğu için işaret olarak kullanılamaz; sayfa özelliği ve ilk
 * paragrafın kalıbı kullanılır.
 */
export function isWikipediaDisambiguation(html: string, lead: string): boolean {
  return (
    /mw:PageProp\/disambiguation/iu.test(html) ||
    /(anlamlara gelebilir|şunlardan birini|may refer to|may also refer to)/iu.test(
      lead.slice(0, 400),
    )
  );
}

/**
 * Makalenin giriş bölümünden (bölüm 0) düz metin. Tablo, kaynak numarası, stil ve şekil atılır;
 * yalnız paragraflar kalır. Kısa ya da anlam ayrımı sayfasında `null`.
 */
export function extractWikipediaLead(
  html: string,
  maxChars = topicReferenceMaxChars,
): string | null {
  const firstSection = html.search(/<section\b[^>]*data-mw-section-id="[1-9]/iu);
  let lead = firstSection > 0 ? html.slice(0, firstSection) : html;
  lead = lead
    .replaceAll(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/giu, " ")
    .replaceAll(/<sup\b[^>]*>[\s\S]*?<\/sup>/giu, "")
    .replaceAll(/<!--[\s\S]*?-->/gu, " ");
  for (const tag of ["table", "figure", "div"]) lead = removeElements(lead, tag);
  const paragraphs = [...lead.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)]
    .map(([, inner]) =>
      decodeEntities((inner ?? "").replaceAll(/<[^>]+>/gu, ""))
        .replaceAll(/\[\d+\]/gu, "")
        .replaceAll(/\s+/gu, " ")
        .trim(),
    )
    .filter((paragraph) => paragraph.length > 0);
  let text = "";
  for (const paragraph of paragraphs) {
    const next = text ? `${text}\n${paragraph}` : paragraph;
    if (next.length > maxChars) {
      if (!text) text = paragraph.slice(0, maxChars).replace(/\s+\S*$/u, "");
      break;
    }
    text = next;
  }
  if (isWikipediaDisambiguation(html, text)) return null;
  return text.length >= topicReferenceMinChars ? text : null;
}

interface CacheEntry {
  reference: TopicReference | null;
  expiresAtMs: number;
}

export interface TopicReferenceFetcherOptions {
  /** Bulunan ve bulunamayan başlıklar bu süre önbellekte kalır (varsayılan 7 gün). */
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

export class TopicReferenceFetcher {
  readonly #reader: Pick<SafeSourceReader, "readHtml">;
  readonly #cache = new Map<string, CacheEntry>();
  readonly #ttlMs: number;
  readonly #maxEntries: number;
  readonly #now: () => number;

  constructor(
    reader: Pick<SafeSourceReader, "readHtml">,
    options: TopicReferenceFetcherOptions = {},
  ) {
    this.#reader = reader;
    this.#ttlMs = options.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
    this.#maxEntries = options.maxEntries ?? 2_000;
    this.#now = options.now ?? Date.now;
  }

  /**
   * Başlığın bilgi notu ya da `null`. Ağ hatası önbelleğe yazılmaz (geçici olabilir); bulunamayan
   * sayfa yazılır. Fırlatmaz, yalnız iptal (`SOURCE_CANCELLED`) yukarı geçer.
   */
  async fetch(title: string, options: SourceReadOptions = {}): Promise<TopicReference | null> {
    const key = title.trim().toLocaleLowerCase("tr-TR");
    if (!key) return null;
    const cached = this.#cache.get(key);
    if (cached && cached.expiresAtMs > this.#now()) return cached.reference;
    let transientFailure = false;
    let reference: TopicReference | null = null;
    for (const lang of topicReferenceLanguages) {
      try {
        const page = await this.#reader.readHtml(wikipediaRenderUrl(lang, title), options);
        const text = extractWikipediaLead(page.html);
        if (text) {
          reference = { lang, url: page.url, text };
          break;
        }
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        if (code === "SOURCE_CANCELLED" || options.signal?.aborted) throw error;
        if (code !== "SOURCE_HTTP_404") transientFailure = true;
      }
    }
    if (reference || !transientFailure) {
      if (this.#cache.size >= this.#maxEntries) {
        const oldest = this.#cache.keys().next().value;
        if (oldest !== undefined) this.#cache.delete(oldest);
      }
      this.#cache.set(key, { reference, expiresAtMs: this.#now() + this.#ttlMs });
    }
    return reference;
  }
}
