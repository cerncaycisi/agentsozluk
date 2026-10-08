import { createHash } from "node:crypto";
import {
  createInterestScorer,
  selectWithInterestRotation,
} from "@/modules/agents/domain/interest-matching";

export interface PerceptionEntryCandidate {
  id: string;
  body: string;
  createdAt: Date;
  score: number;
  topic: { id: string; title: string };
  author: { id: string; username: string; displayName: string };
  followedTopic: boolean;
  followedAuthor: boolean;
}

export interface TopicChoiceEntry {
  topic: { id: string; title: string };
  createdAt: Date | string;
  topicOpenedByCurrentWriter?: boolean;
}

export interface TopicChoiceLinkedTopic {
  topic: { id: string; title: string };
  thin: boolean;
}

function deterministicTieBreak(seed: string, id: string): number {
  return Number.parseInt(
    createHash("sha256").update(`${seed}:${id}`).digest("hex").slice(0, 8),
    16,
  );
}

export function selectPerceptionEntries(
  candidates: PerceptionEntryCandidate[],
  input: {
    seed: string;
    interests: Array<{ key: string; weight: number }>;
    limit: number;
    now: Date;
  },
): PerceptionEntryCandidate[] {
  const interestScore = createInterestScorer(input.interests);
  return [...candidates]
    .map((candidate) => {
      const interest = interestScore(`${candidate.topic.title} ${candidate.body}`);
      const ageHours = Math.max(0, input.now.getTime() - candidate.createdAt.getTime()) / 3_600_000;
      const recency = 1 / (1 + ageHours / 12);
      const rank =
        interest * 4 +
        recency * 2 +
        (candidate.followedTopic ? 1.5 : 0) +
        (candidate.followedAuthor ? 1.5 : 0) +
        Math.min(1, Math.max(-1, candidate.score / 10)) * 0.25;
      return { candidate, rank, tie: deterministicTieBreak(input.seed, candidate.id) };
    })
    .sort((left, right) => right.rank - left.rank || left.tie - right.tie)
    .slice(0, input.limit)
    .map(({ candidate }) => candidate);
}

export function selectDiverseSourceItems<T>(
  groups: readonly (readonly T[])[],
  limit: number,
  interestScore?: (item: T) => number,
): T[] {
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError("limit negatif olamaz.");
  const selected: T[] = [];
  const maximumDepth = groups.reduce((maximum, group) => Math.max(maximum, group.length), 0);
  const rotationLimit = interestScore ? Infinity : limit;
  for (let depth = 0; depth < maximumDepth && selected.length < rotationLimit; depth += 1) {
    for (const group of groups) {
      const item = group[depth];
      if (item !== undefined) selected.push(item);
      if (selected.length >= rotationLimit) break;
    }
  }
  return interestScore ? selectWithInterestRotation(selected, limit, interestScore) : selected;
}

export function buildTopicChoiceSignals(
  ownEntries: TopicChoiceEntry[],
  recentEntries: TopicChoiceEntry[],
  linkedTopics: TopicChoiceLinkedTopic[],
  explorationLimit = 8,
) {
  if (!Number.isInteger(explorationLimit) || explorationLimit < 0)
    throw new RangeError("explorationLimit negatif olamaz.");
  const ownTopicCounts = new Map<
    string,
    { topic: { id: string; title: string }; recentEntryCount: number; lastWrittenAt: string }
  >();
  for (const entry of ownEntries) {
    const writtenAt =
      entry.createdAt instanceof Date ? entry.createdAt.toISOString() : entry.createdAt;
    const current = ownTopicCounts.get(entry.topic.id);
    if (current) current.recentEntryCount += 1;
    else
      ownTopicCounts.set(entry.topic.id, {
        topic: entry.topic,
        recentEntryCount: 1,
        lastWrittenAt: writtenAt,
      });
  }
  const newestOwnTopicId = ownEntries[0]?.topic.id ?? null;
  let consecutiveOwnEntryCount = 0;
  if (newestOwnTopicId)
    for (const entry of ownEntries) {
      if (entry.topic.id !== newestOwnTopicId) break;
      consecutiveOwnEntryCount += 1;
    }

  const excludeFromExploration =
    newestOwnTopicId && consecutiveOwnEntryCount >= 2 ? newestOwnTopicId : null;
  const seen = new Set<string>();
  const explorationTopics: Array<{
    topic: { id: string; title: string };
    signal: "OTHER_WRITER" | "DICTIONARY_LINK";
    thin?: boolean;
  }> = [];
  const append = (
    topic: { id: string; title: string },
    signal: "OTHER_WRITER" | "DICTIONARY_LINK",
    thin?: boolean,
  ) => {
    if (
      explorationTopics.length >= explorationLimit ||
      topic.id === excludeFromExploration ||
      seen.has(topic.id)
    )
      return;
    seen.add(topic.id);
    explorationTopics.push({ topic, signal, ...(thin === undefined ? {} : { thin }) });
  };
  for (const entry of recentEntries)
    if (!entry.topicOpenedByCurrentWriter) append(entry.topic, "OTHER_WRITER");
  for (const linkedTopic of linkedTopics)
    append(linkedTopic.topic, "DICTIONARY_LINK", linkedTopic.thin);

  return {
    consecutiveOwnTopic:
      newestOwnTopicId === null
        ? null
        : {
            topic: ownEntries[0]!.topic,
            consecutiveOwnEntryCount,
          },
    recentOwnTopics: [...ownTopicCounts.values()],
    explorationTopics,
  };
}

export function truncateUntrustedText(value: string, maximum = 1200): string {
  const normalized = value.normalize("NFKC").replaceAll(/\s+/gu, " ").trim();
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1)}…`;
}

// A′ okuma sözleşmesi: ilk ve en yeni altı entry 2000, en yeni 15'in kalanı 600 karakter.
// #13 (8 Ekim): en yeni 15'ten eski arşiv entry'leri 160 karakterlik önizleme.
export const runtimeReadTopicFullEntryCount = 6;
export const runtimeReadTopicPreviewCharLimit = 600;
export const runtimeReadTopicRecentCount = 15;
export const runtimeReadTopicArchiveCharLimit = 160;
/** İstemde kısaltılan okunan entry'lerin tam metni; yalnız yenilik kapısı için (#13). */
export const runtimeReadTopicFullBodiesKey = "readTopicFullBodies";
export function runtimeReadTopicEntryLimit(index: number, count: number): number {
  if (index === 0 || index >= count - runtimeReadTopicFullEntryCount) return 2000;
  return index >= count - runtimeReadTopicRecentCount
    ? runtimeReadTopicPreviewCharLimit
    : runtimeReadTopicArchiveCharLimit;
}
