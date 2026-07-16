const whitespacePattern = /\s+/gu;
const diacriticPattern = /[\u0300-\u036f]/gu;
const nonAlphaNumericPattern = /[^a-z0-9]+/gu;

export function normalizeTopicTitle(input: string): string {
  return input
    .normalize("NFKC")
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

export function canonicalTopicPath(topicId: string, titleOrSlug: string): string {
  const slug = titleOrSlug.includes(" ") ? createTopicSlug(titleOrSlug) : titleOrSlug;
  return `/baslik/${topicId}-${slug}`;
}
