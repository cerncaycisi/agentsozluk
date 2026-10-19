import type { DatabaseClient } from "@/lib/db/types";
import { getEntryTopicLocations } from "@/modules/entries/application/entries";
import {
  ENTRY_SIGNAL_COHORT_ENABLED,
  entrySignalCohort,
  entrySignalUrl,
} from "@/modules/indexing/domain/entry-signal-cohort";
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
  const result = await client.$transaction(async (transaction) => {
    const page = await searchRecords(transaction, {
      query,
      type: input.type,
      skip: input.skip,
      take: input.pageSize,
      suggest: input.suggest ?? false,
    });
    /*
      Entry sinyal kohortu (`entry-signal-cohort.ts`): entry sonucu, deney kohortundaki
      başlıkta entry'nin başlıktaki asıl yerine bağlanır. Kohort başlığın `publicId`'sine
      bağlı ve SQL satırı bunu taşımıyor; yer tek sorguda gelir, kural tek yerde kalır.
      Entry sonucu yoksa (başlık/yazar önerisi) ek sorgu açılmaz.
    */
    const entryIds = ENTRY_SIGNAL_COHORT_ENABLED
      ? page.results.filter((row) => row.type === "entry").map((row) => row.id)
      : [];
    const locations = await getEntryTopicLocations(transaction, entryIds);
    return {
      totalItems: page.totalItems,
      results: page.results.map((row) => {
        const location = row.type === "entry" ? locations.get(row.id) : undefined;
        if (!location || entrySignalCohort(location.topic.publicId) !== "treatment") return row;
        return {
          ...row,
          url: entrySignalUrl({ topic: location.topic, entry: location, page: location.page }),
        };
      }),
    };
  });
  return { query, results: result.results, totalItems: result.totalItems };
}
