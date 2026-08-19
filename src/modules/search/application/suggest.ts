import type { DatabaseClient } from "@/lib/db/types";
import { searchAll } from "@/modules/search/application/search";
import { normalizeSearchQuery, shouldSearchDatabase } from "@/modules/search/domain/normalization";
import {
  emptySearchSuggestions,
  SEARCH_SUGGESTION_LIMIT,
  toTopicSuggestions,
  toUserSuggestions,
  type SearchSuggestions,
} from "@/modules/search/domain/suggestions";

export const SEARCH_SUGGESTION_MAX_QUERY_LENGTH = 100;

/**
 * Öneri sorgusunu `/ara` sayfasıyla aynı şekilde normalize eder ve 100 karaktere
 * keser. `slice` UTF-16 kod birimi üzerinden çalıştığı için sonuçtaki kod noktası
 * sayısı her zaman 100 veya daha azdır.
 */
export function normalizeSuggestQuery(input: string): string {
  return normalizeSearchQuery(input).slice(0, SEARCH_SUGGESTION_MAX_QUERY_LENGTH);
}

/**
 * Arama önerileri. Yeni bir arama motoru kurmaz; mevcut `searchAll` çağrısını
 * yalnız başlık ve yalnız yazar olmak üzere iki dar sorguyla yeniden kullanır.
 * Entry gövdesi taranmaz, bu yüzden snippet üretilmez.
 */
export async function searchSuggestions(
  client: DatabaseClient,
  input: { query: string },
): Promise<SearchSuggestions> {
  const query = normalizeSuggestQuery(input.query);
  if (!shouldSearchDatabase(query)) return emptySearchSuggestions();
  const [topics, users] = await Promise.all([
    searchAll(client, {
      query,
      type: "topics",
      page: 1,
      pageSize: SEARCH_SUGGESTION_LIMIT,
      skip: 0,
      suggest: true,
    }),
    searchAll(client, {
      query,
      type: "users",
      page: 1,
      pageSize: SEARCH_SUGGESTION_LIMIT,
      skip: 0,
      suggest: true,
    }),
  ]);
  return {
    topics: toTopicSuggestions(topics.results),
    users: toUserSuggestions(users.results),
  };
}
