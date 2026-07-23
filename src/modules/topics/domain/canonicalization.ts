import { normalizeTopicTitle } from "@/modules/topics/domain/normalization";

export type TopicCanonicalSearchReason = "EXACT_TITLE" | "ABOUT_SUFFIX" | "QUESTION_SUFFIX";

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
