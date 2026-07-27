import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

export type DictionaryPlatform = "eksi" | "normal";

export interface DictionaryFlowMetrics {
  platform: DictionaryPlatform;
  topicCount: number;
  entryCount: number;
  topicWords: {
    median: number;
    p75: number;
    p95: number;
    oneToThree: number;
    sevenOrMore: number;
  };
  topicForms: {
    dated: number;
    questionOrPrompt: number;
    syntheticAnalyticFrame: number;
  };
  entryWords: {
    median: number;
    p75: number;
    p95: number;
    tenOrFewer: number;
    elevenToThirty: number;
    thirtyOneToOneHundred: number;
    overOneHundred: number;
  };
  entryForms: {
    oneBlock: number;
    multiBlock: number;
    internalLink: number;
    bkz: number;
    firstPerson: number;
    definitionLike: number;
  };
}

const selectors = {
  eksi: {
    topic: ".topic-list a",
    entry: ".home-page-entry-list .content",
    removableTopicChildren: "small",
  },
  normal: {
    topic: ".loadcenter",
    entry: ".entrytext",
    removableTopicChildren: ".titlelist-entrycount",
  },
} as const;

const normalize = (value: string): string => value.replace(/\s+/gu, " ").trim();

const words = (value: string): number => normalize(value).split(/\s+/u).filter(Boolean).length;

const percentile = (values: number[], ratio: number): number => {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(ratio * ordered.length) - 1] ?? 0;
};

const topicText = (element: Element, removableChildren: string): string => {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll(removableChildren).forEach((child) => child.remove());
  return normalize(clone.textContent ?? "");
};

const blockCount = (element: Element): number => {
  const explicitBlocks = element.querySelectorAll("p, blockquote, ul, ol").length;
  const breaks = element.querySelectorAll("br").length;
  return Math.max(1, explicitBlocks, breaks + 1);
};

const datedTitle =
  /\b(?:19|20)\d{2}\b|\b\d{1,2}\s+(?:ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\b/iu;
const questionOrPromptTitle =
  /\b(?:mi|mı|mu|mü|sorusu|sorunsalı|öneriler|yapılacaklar|seçilecek|anlatmak|bırak|vs)\b/iu;
const syntheticAnalyticTitle =
  /\b(?:bağlamında|sonrasında|kapasitesi|koordinasyonu|sentezinde|güncellemesi|görünmeyen)\b/iu;
const firstPersonEntry =
  /\b(?:ben|bence|bana|beni|benim|biz|bizce|bize|bizim|düşünüyorum|seviyorum|hatırlıyorum)\b/iu;
const definitionLikeEntry =
  /^(?:.+\s)?(?:bir|bu|şu)?\s*.{0,80}\b(?:anlamına gelen|olarak bilinen|denir|ifadesidir|kişidir|insandır|durumdur|eylemdir|kavramdır|şeydir|aktivitedir|eseridir)\b/iu;

export function benchmarkDictionaryFlow(
  html: string,
  platform: DictionaryPlatform,
): DictionaryFlowMetrics {
  const document = new JSDOM(html).window.document;
  const config = selectors[platform];
  const topics = [...document.querySelectorAll(config.topic)]
    .map((element) => topicText(element, config.removableTopicChildren))
    .filter(Boolean);
  const entries = [...document.querySelectorAll(config.entry)].map((element) => ({
    element,
    text: normalize(element.textContent ?? ""),
    blocks: blockCount(element),
    internalLink: [...element.querySelectorAll<HTMLAnchorElement>("a[href]")].some((anchor) => {
      const href = anchor.getAttribute("href") ?? "";
      return (
        href.startsWith("/") || href.includes("eksisozluk.com") || href.includes("normalsozluk.com")
      );
    }),
    bkz:
      element.querySelector(".b, .bkz") !== null ||
      /\(\s*bkz\s*:/iu.test(element.textContent ?? ""),
  }));
  const topicWordCounts = topics.map(words);
  const entryWordCounts = entries.map(({ text }) => words(text));

  return {
    platform,
    topicCount: topics.length,
    entryCount: entries.length,
    topicWords: {
      median: percentile(topicWordCounts, 0.5),
      p75: percentile(topicWordCounts, 0.75),
      p95: percentile(topicWordCounts, 0.95),
      oneToThree: topicWordCounts.filter((count) => count >= 1 && count <= 3).length,
      sevenOrMore: topicWordCounts.filter((count) => count >= 7).length,
    },
    topicForms: {
      dated: topics.filter((title) => datedTitle.test(title)).length,
      questionOrPrompt: topics.filter((title) => questionOrPromptTitle.test(title)).length,
      syntheticAnalyticFrame: topics.filter((title) => syntheticAnalyticTitle.test(title)).length,
    },
    entryWords: {
      median: percentile(entryWordCounts, 0.5),
      p75: percentile(entryWordCounts, 0.75),
      p95: percentile(entryWordCounts, 0.95),
      tenOrFewer: entryWordCounts.filter((count) => count <= 10).length,
      elevenToThirty: entryWordCounts.filter((count) => count >= 11 && count <= 30).length,
      thirtyOneToOneHundred: entryWordCounts.filter((count) => count >= 31 && count <= 100).length,
      overOneHundred: entryWordCounts.filter((count) => count > 100).length,
    },
    entryForms: {
      oneBlock: entries.filter(({ blocks }) => blocks === 1).length,
      multiBlock: entries.filter(({ blocks }) => blocks > 1).length,
      internalLink: entries.filter(({ internalLink }) => internalLink).length,
      bkz: entries.filter(({ bkz }) => bkz).length,
      firstPerson: entries.filter(({ text }) => firstPersonEntry.test(text)).length,
      definitionLike: entries.filter(({ text }) => definitionLikeEntry.test(text)).length,
    },
  };
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const platform = argument("--platform");
  if (platform !== "eksi" && platform !== "normal") {
    throw new Error("--platform must be eksi or normal");
  }
  const input = argument("--input") ?? "-";
  const html = input === "-" ? readFileSync(0, "utf8") : readFileSync(input, "utf8");
  process.stdout.write(`${JSON.stringify(benchmarkDictionaryFlow(html, platform), null, 2)}\n`);
}
