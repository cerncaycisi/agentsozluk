const whitespacePattern = /\s+/gu;
const diacriticPattern = /[\u0300-\u036f]/gu;
const nonAlphaNumericPattern = /[^a-z0-9]+/gu;

/*
  G\u00f6r\u00fcnmez bi\u00e7im karakterleri (Unicode `Cf`): s\u0131f\u0131r geni\u015flikli bo\u015fluk, ZWNJ, ZWJ,
  yumu\u015fak tire, BOM ve y\u00f6n denetimleri. Ekranda hi\u00e7biri iz b\u0131rakmaz.

  \u00d6l\u00e7\u00fcld\u00fc (27 A\u011fu): `normalizeTopicTitle` yaln\u0131z NFKC + bo\u015fluk sadele\u015ftirmesi
  yapt\u0131\u011f\u0131 i\u00e7in `T\u00fcrkiye` ile aras\u0131na s\u0131f\u0131r geni\u015flikli bo\u015fluk konmu\u015f `T\u00fcrkiye`
  AYRI KAYIT oluyordu; ayn\u0131s\u0131 ZWJ ve yumu\u015fak tire i\u00e7in de. Yani okurun tek bir
  ba\u015fl\u0131k g\u00f6rd\u00fc\u011f\u00fc yerde s\u00f6zl\u00fckte iki adres olabiliyordu \u2014 bu deponun par\u00e7alanma
  sorununun sessiz bir kolu. \u00dcretimde vaka yok (0/4 460), d\u00fczeltme \u00f6nleyici.

  Yaln\u0131z KAR\u015eILA\u015eTIRMA ANAHTARINDAN at\u0131l\u0131yor; g\u00f6r\u00fcnen ba\u015fl\u0131k dokunulmadan
  saklan\u0131yor. Emoji ZWJ dizileri de bu y\u00fczden bozulmuyor: `\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67` ekranda ayn\u0131
  kal\u0131r, yaln\u0131z kopya tespitinde `\ud83d\udc68\ud83d\udc69\ud83d\udc67` ile \u00e7ak\u0131\u015f\u0131r \u2014 istenen davran\u0131\u015f budur.
*/
const invisibleFormatPattern = /\p{Cf}/gu;

export function normalizeTopicTitle(input: string): string {
  return input
    .normalize("NFKC")
    .replaceAll(invisibleFormatPattern, "")
    .trim()
    .replaceAll(/\r\n?|\n/gu, " ")
    .replaceAll(whitespacePattern, " ")
    .toLocaleLowerCase("tr-TR");
}

export function createTopicSlug(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replaceAll("ı", "i")
    .replaceAll("İ", "I")
    .replaceAll(diacriticPattern, "")
    .toLowerCase()
    .replaceAll(nonAlphaNumericPattern, "-")
    .replaceAll(/-+/gu, "-")
    .replaceAll(/^-|-$/gu, "")
    .slice(0, 80)
    .replaceAll(/-$/gu, "");

  return slug || "baslik";
}

export function canonicalTopicPath(publicId: number, titleOrSlug: string): string {
  const slug = titleOrSlug.includes(" ") ? createTopicSlug(titleOrSlug) : titleOrSlug;
  return `/baslik/${slug}--${publicId}`;
}
