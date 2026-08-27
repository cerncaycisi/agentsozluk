import { normalizeTopicTitle } from "@/modules/topics/domain/normalization";

export type TopicCanonicalSearchReason =
  | "EXACT_TITLE"
  | "ABOUT_SUFFIX"
  | "QUESTION_SUFFIX"
  | "APOSTROPHE_CASE_SUFFIX";

export interface TopicCanonicalSearchCandidate {
  query: string;
  normalizedQuery: string;
  reason: TopicCanonicalSearchReason;
}

function displayTitle(input: string): string {
  return input
    .normalize("NFKC")
    .trim()
    .replaceAll(/\r\n?|\n/gu, " ")
    .replaceAll(/\s+/gu, " ");
}

function withoutTerminalQuestionMark(input: string): string {
  return input.replaceAll(/\s*\?+\s*$/gu, "").trim();
}

// Türkçe yazımda özel ada gelen hâl eki kesme işaretiyle ayrılır: `Kazakistan'da`,
// `TURKA'nın`, `Oak Park'ta`. Bu sınır sayesinde eki atmak belirsiz değildir; sınırsız
// gövdeleme ise `sanat`/`sanatı` gibi sözcükleri bozar. Bu yüzden yalnız kesme işaretinden
// sonra gelen ve bilinen bir hâl ekiyle birebir örtüşen parça atılır. İyelik ve fiilden ad
// türeten ekler (`kaçınma`/`kaçınmak`, `taşıma`/`taşıması`) kapsam dışıdır.
// Her iki kesme işareti de gerçek metinde geçer: U+0027 ve U+2019.
const apostropheCaseSuffixPattern =
  /(?<=[\p{L}\p{N}])[’'](?:nd[ae]n|nd[ae]|n[ıiuü]n|d[ae]n|t[ae]n|d[ae]|t[ae]|[ıiuü]n|y[ıiuü]|yl[ae]|l[ae]|y[ae]|[ıiuü]|[ae])(?=\s|$)/giu;

function withoutApostropheCaseSuffix(input: string): string {
  return input.replaceAll(apostropheCaseSuffixPattern, "");
}

function canonicalVariant(input: string): Omit<TopicCanonicalSearchCandidate, "normalizedQuery">[] {
  const candidates: Omit<TopicCanonicalSearchCandidate, "normalizedQuery">[] = [];
  const withoutQuestionMark = withoutTerminalQuestionMark(input);

  const aboutMatch = /^(.*?)\s+hakkında(?:\s+bilgi)?$/iu.exec(withoutQuestionMark);
  if (aboutMatch?.[1]) candidates.push({ query: aboutMatch[1].trim(), reason: "ABOUT_SUFFIX" });

  const questionMatch =
    /^(.*?)\s+(?:nedir|kimdir|ne\s+demek|nerededir|nerede|ne\s+zamandır|ne\s+zaman)$/iu.exec(
      withoutQuestionMark,
    );
  if (questionMatch?.[1])
    candidates.push({ query: questionMatch[1].trim(), reason: "QUESTION_SUFFIX" });
  if (withoutQuestionMark !== input)
    candidates.push({ query: withoutQuestionMark, reason: "QUESTION_SUFFIX" });

  // En sonda: mevcut `hakkında`/soru kalıpları daha dar olduğu için tercih edilen sorgu
  // olmayı sürdürür; kesme eki varyantı yalnız onlar hiç eşleşmediğinde öne geçer.
  const withoutCaseSuffix = withoutApostropheCaseSuffix(withoutQuestionMark);
  if (withoutCaseSuffix !== withoutQuestionMark)
    candidates.push({ query: withoutCaseSuffix.trim(), reason: "APOSTROPHE_CASE_SUFFIX" });

  return candidates;
}

export function topicCanonicalSearchCandidates(title: string): TopicCanonicalSearchCandidate[] {
  const exact = displayTitle(title);
  if (!exact) return [];
  const seen = new Set<string>();
  return [{ query: exact, reason: "EXACT_TITLE" as const }, ...canonicalVariant(exact)].flatMap(
    (candidate) => {
      const normalizedQuery = normalizeTopicTitle(candidate.query);
      if (!normalizedQuery || seen.has(normalizedQuery)) return [];
      seen.add(normalizedQuery);
      return [{ ...candidate, normalizedQuery }];
    },
  );
}

export function preferredTopicCreationSearchQuery(title: string): string {
  const candidates = topicCanonicalSearchCandidates(title);
  return candidates.find((candidate) => candidate.reason !== "EXACT_TITLE")?.query ?? title.trim();
}
