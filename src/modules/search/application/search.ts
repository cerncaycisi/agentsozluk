import type { PrismaClient } from "@prisma/client";
import { normalizeSearchQuery, shouldSearchDatabase } from "@/modules/search/domain/normalization";
import { searchRecords } from "@/modules/search/repository/search";
import type { SearchType } from "@/modules/search/validation/schemas";

export async function searchAll(
  client: PrismaClient,
  input: { query: string; type: SearchType; page: number; pageSize: number; skip: number },
) {
  const query = normalizeSearchQuery(input.query);
  if (!shouldSearchDatabase(query)) return { query, results: [], totalItems: 0 };
  const results = await client.$transaction((transaction) =>
    searchRecords(transaction, { query, type: input.type, skip: input.skip, take: input.pageSize }),
  );
  return { query, results, totalItems: results[0]?.totalItems ?? 0 };
}
