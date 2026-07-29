export const sourceLocaleFocusValues = [
  "GLOBAL",
  "TURKISH_LANGUAGE",
  "TURKEY_FOCUSED",
  "TURKISH_LANGUAGE_AND_TURKEY_FOCUSED",
] as const;

export type SourceLocaleFocus = (typeof sourceLocaleFocusValues)[number];

const turkishLanguageSourceUrls = new Set([
  "https://acikbilim.com/feed/",
  "https://altyazi.net/feed/",
  "https://argonotlar.com/feed/",
  "https://artdogistanbul.com/feed/",
  "https://bantmag.com/feed/",
  "https://bianet.org/bianet.rss",
  "https://bilimakademisi.org/feed/",
  "https://bilimgenc.tubitak.gov.tr/rss.xml",
  "https://cazkolik.com/rss.xml",
  "https://dergipark.org.tr/tr/pub/tdfd/rss/lastissue/tr",
  "https://disk.org.tr/feed/",
  "https://evrimagaci.org/rss.xml",
  "https://fayn.press/feed/",
  "https://feeds.bbci.co.uk/turkce/rss.xml",
  "https://fikirturu.com/feed/",
  "https://haber.aero/feed/",
  "https://ifade.org.tr/engelliweb/feed/",
  "https://journo.com.tr/feed",
  "https://kantan.news/feed",
  "https://manifold.press/rss",
  "https://medyascope.tv/feed/",
  "https://sanatatak.com/feed/",
  "https://sarkac.org/feed/",
  "https://t24.com.tr/rss",
  "https://teyit.org/feed",
  "https://tr.euronews.com/rss",
  "https://vesaire.press/feed/",
  "https://www.aa.com.tr/tr/rss/default?cat=guncel",
  "https://www.agos.com.tr/rss",
  "https://www.arkitera.com/feed/",
  "https://www.birbabaindie.com/feed/",
  "https://www.bloomberght.com/rss",
  "https://www.dunya.com/rss?dunya",
  "https://www.ekonomim.com/export/rss",
  "https://www.evrensel.net/rss/haber.xml",
  "https://www.havayolu101.com/feed/",
  "https://www.iklimhaber.org/feed/",
  "https://www.k24kitap.org/rss",
  "https://www.log.com.tr/feed/",
  "https://www.lojiport.com/feed/",
  "https://www.ntv.com.tr/teknoloji.rss",
  "https://www.sivilsayfalar.org/feed/",
  "https://www.sosyalbilimler.org/feed/",
  "https://www.tmmob.org.tr/rss.xml",
  "https://www.trthaber.com/sondakika.rss",
  "https://yesilgazete.org/feed/",
]);

const turkeyFocusedSourceUrls = new Set(["https://www.newslabturkey.org/feed/"]);

const turkishLanguageAndTurkeyFocusedSourceUrls = new Set([
  "https://turkiye.un.org/tr/stories/rss.xml",
]);

export function reviewedSourceLocaleFocus(url: string): SourceLocaleFocus {
  if (turkishLanguageAndTurkeyFocusedSourceUrls.has(url))
    return "TURKISH_LANGUAGE_AND_TURKEY_FOCUSED";
  if (turkeyFocusedSourceUrls.has(url)) return "TURKEY_FOCUSED";
  if (turkishLanguageSourceUrls.has(url)) return "TURKISH_LANGUAGE";
  return "GLOBAL";
}

export function isTurkishOrTurkeyFocused(localeFocus: SourceLocaleFocus): boolean {
  return localeFocus !== "GLOBAL";
}

export function reviewedTurkishOrTurkeyFocusedSourceUrls(): string[] {
  return [
    ...turkishLanguageSourceUrls,
    ...turkeyFocusedSourceUrls,
    ...turkishLanguageAndTurkeyFocusedSourceUrls,
  ].sort();
}
