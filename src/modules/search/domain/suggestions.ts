export const SEARCH_SUGGESTION_LIMIT = 8;

const PROFILE_URL_PREFIX = "/yazar/";

export interface TopicSuggestion {
  title: string;
  url: string;
}

export interface UserSuggestion {
  username: string;
  url: string;
}

export interface SearchSuggestions {
  topics: TopicSuggestion[];
  users: UserSuggestion[];
}

/**
 * Yalnızca `searchAll` sonuç satırlarından okunan alanlar; öneri katmanı arama
 * motorunun tamamına değil bu dar yüzeye bağlıdır.
 */
export interface SuggestionSourceRow {
  type: "topic" | "entry" | "user";
  title: string;
  url: string;
}

export function emptySearchSuggestions(): SearchSuggestions {
  return { topics: [], users: [] };
}

/**
 * Profil bağlantısındaki genel (public) kullanıcı adını çıkarır. Kaynak satırda
 * ham kullanıcı adı bulunmaz; `publicProfileUrl` üzerinden üretilen genel kimlik
 * kullanılır, böylece takma kimlikli yazarların ham kullanıcı adı sızmaz.
 */
export function publicUsernameFromProfileUrl(url: string): string | null {
  if (!url.startsWith(PROFILE_URL_PREFIX)) return null;
  const segment = url.slice(PROFILE_URL_PREFIX.length);
  if (segment.length === 0 || segment.includes("/")) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function toTopicSuggestions(
  rows: readonly SuggestionSourceRow[],
  limit: number = SEARCH_SUGGESTION_LIMIT,
): TopicSuggestion[] {
  return rows
    .filter((row) => row.type === "topic")
    .slice(0, limit)
    .map((row) => ({ title: row.title, url: row.url }));
}

export function toUserSuggestions(
  rows: readonly SuggestionSourceRow[],
  limit: number = SEARCH_SUGGESTION_LIMIT,
): UserSuggestion[] {
  return rows
    .filter((row) => row.type === "user")
    .flatMap((row) => {
      const username = publicUsernameFromProfileUrl(row.url);
      return username === null ? [] : [{ username, url: row.url }];
    })
    .slice(0, limit);
}
