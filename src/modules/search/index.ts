export { searchAll } from "@/modules/search/application/search";
export {
  normalizeSuggestQuery,
  searchSuggestions,
  SEARCH_SUGGESTION_MAX_QUERY_LENGTH,
} from "@/modules/search/application/suggest";
export {
  emptySearchSuggestions,
  publicUsernameFromProfileUrl,
  SEARCH_SUGGESTION_LIMIT,
  toTopicSuggestions,
  toUserSuggestions,
  type SearchSuggestions,
  type TopicSuggestion,
  type UserSuggestion,
} from "@/modules/search/domain/suggestions";
export {
  escapeLikePattern,
  normalizeSearchQuery,
  shouldSearchDatabase,
} from "@/modules/search/domain/normalization";
export { compareSearchRank, type SearchRankFactors } from "@/modules/search/domain/ranking";
export { searchTypeSchema, type SearchType } from "@/modules/search/validation/schemas";
