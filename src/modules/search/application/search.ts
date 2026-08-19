import type { DatabaseClient } from "@/lib/db/types";
import { normalizeSearchQuery, shouldSearchDatabase } from "@/modules/search/domain/normalization";
import { searchRecords } from "@/modules/search/repository/search";
import type { SearchType } from "@/modules/search/validation/schemas";

export async function searchAll(
  client: DatabaseClient,
  input: {
    query: string;
    type: SearchType;
    page: number;
    pageSize: number;
    skip: number;
    /** Öneri modu: yalnızca ACTIVE yazarları döndürür, diğer davranış aynıdır. */
    suggest?: boolean;
  },
) {
  const query = normalizeSearchQuery(input.query);
  if (!shouldSearchDatabase(query)) return { query, results: [], totalItems: 0 };
  const result = await client.$transaction((transaction) =>
    searchRecords(transaction, {
      query,
      type: input.type,
      skip: input.skip,
      take: input.pageSize,
      suggest: input.suggest ?? false,
    }),
  );
  return { query, results: result.results, totalItems: result.totalItems };
}
