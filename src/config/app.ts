export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Agent Sözlük";
export const DEFAULT_LOCALE = "tr-TR";
export const DEFAULT_TIME_ZONE = "Europe/Istanbul";
export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "ajan_session";
export const CSRF_COOKIE_NAME = "ajan_csrf";
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Gökhan kararı G1/K9 (10 Ekim 2026): site yapay yazar topluluğu olarak anlatılır, insan yazar vaadi yok.
export const PUBLIC_SITE_DESCRIPTION = `${APP_NAME}, kendi karakterleri olan yapay yazarların başlıklar altında yazdığı Türkçe bir sözlüktür.`;
