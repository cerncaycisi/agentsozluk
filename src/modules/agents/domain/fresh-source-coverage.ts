import { runtimePresentableSourceStatuses } from "@/modules/agents/domain/source-status";

const RUNTIME_ENABLED_SOURCE_STATUSES = new Set<string>(runtimePresentableSourceStatuses);
const TURKISH_OR_TURKEY_FOCUSED = new Set([
  "TURKISH_LANGUAGE",
  "TURKEY_FOCUSED",
  "TURKISH_LANGUAGE_AND_TURKEY_FOCUSED",
]);

export interface FreshSourceInput {
  username: string;
  url: string;
  normalizedDomain: string;
  status: string;
  adminBlocked: boolean;
  localeFocus: string;
  topics: unknown;
  usefulItemFetchedAt: Date | null;
}

export interface FreshSourceCoverage {
  sources: number;
  origins: number;
  categories: number;
}

export interface FreshSourceCoverageSummary {
  poolSources: number;
  poolOrigins: number;
  poolTurkishOrTurkeyFocusedSources: number;
  invalidTopicPayloads: number;
  byAgent: Map<string, FreshSourceCoverage>;
}

function sourceCategories(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const categories = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (categories.length !== value.length) return null;
  return [...new Set(categories)];
}

export function summarizeFreshSourceCoverage(
  sources: readonly FreshSourceInput[],
  cohortUsernames: readonly string[],
  window: { from: Date; to: Date },
): FreshSourceCoverageSummary {
  const cohort = new Set(cohortUsernames);
  const poolUrls = new Set<string>();
  const poolOrigins = new Set<string>();
  const poolTurkishOrTurkeyFocusedUrls = new Set<string>();
  const sourceUrlsByAgent = new Map<string, Set<string>>();
  const originsByAgent = new Map<string, Set<string>>();
  const categoriesByAgent = new Map<string, Set<string>>();
  let invalidTopicPayloads = 0;

  for (const username of cohort) {
    sourceUrlsByAgent.set(username, new Set());
    originsByAgent.set(username, new Set());
    categoriesByAgent.set(username, new Set());
  }

  for (const source of sources) {
    if (
      source.adminBlocked ||
      !RUNTIME_ENABLED_SOURCE_STATUSES.has(source.status) ||
      !source.usefulItemFetchedAt ||
      source.usefulItemFetchedAt < window.from ||
      source.usefulItemFetchedAt >= window.to
    ) {
      continue;
    }
    const categories = sourceCategories(source.topics);
    if (!categories) invalidTopicPayloads += 1;
    poolUrls.add(source.url);
    poolOrigins.add(source.normalizedDomain);
    if (TURKISH_OR_TURKEY_FOCUSED.has(source.localeFocus)) {
      poolTurkishOrTurkeyFocusedUrls.add(source.url);
    }
    if (!cohort.has(source.username)) continue;
    sourceUrlsByAgent.get(source.username)?.add(source.url);
    originsByAgent.get(source.username)?.add(source.normalizedDomain);
    for (const category of categories ?? []) categoriesByAgent.get(source.username)?.add(category);
  }

  return {
    poolSources: poolUrls.size,
    poolOrigins: poolOrigins.size,
    poolTurkishOrTurkeyFocusedSources: poolTurkishOrTurkeyFocusedUrls.size,
    invalidTopicPayloads,
    byAgent: new Map(
      [...cohort]
        .sort((left, right) => left.localeCompare(right))
        .map((username) => [
          username,
          {
            sources: sourceUrlsByAgent.get(username)?.size ?? 0,
            origins: originsByAgent.get(username)?.size ?? 0,
            categories: categoriesByAgent.get(username)?.size ?? 0,
          },
        ]),
    ),
  };
}
