/**
 * Tema tercihinin tek kaynağı. Başlıktaki düğme (yalnız açık/koyu) ile ayarlar
 * sayfasındaki seçenek (sisteme dönüş dahil) aynı mantığı paylaşsın, "sisteme
 * dön" yolu iki yerde birden yazılmasın diye.
 *
 * Tarayıcıya bağlı bir modül: yalnız istemci bileşenlerinden çağrılır.
 */

export type ThemePreference = "system" | "light" | "dark";

/** Ekranda gerçekten uygulanan tema. `system` çözümlendikten sonraki hali. */
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "ajan_theme";

/** Bir yıl. Sunucu `layout.tsx`'te `data-theme`'i bu cookie'den okuyor. */
const THEME_COOKIE_MAX_AGE = 31_536_000;

/**
 * Aynı sayfada birden fazla tema kontrolü olabiliyor (ayarlarda hem başlıktaki
 * düğme hem seçenek listesi). Biri değiştirince diğeri de tazelensin diye.
 */
export const THEME_CHANGE_EVENT = "ajan:tema-degisti";

export function isExplicitTheme(value: string | null | undefined): value is ResolvedTheme {
  return value === "light" || value === "dark";
}

export function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readPreference(): ThemePreference {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isExplicitTheme(saved)) return saved;
  if (saved === "system") return "system";
  // Sunucu cookie'den `data-theme` yazdıysa localStorage boş olsa da onu esas al.
  const rendered = document.documentElement.dataset.theme;
  if (isExplicitTheme(rendered)) return rendered;
  return "system";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

/**
 * KRİTİK — `system` dalı `data-theme` attribute'unu kaldırır ve tercihi açıkça `system`
 * olarak yazar (localStorage + cookie). 9 Ekim 2026'dan beri çerez yoksa site koyu açılıyor;
 * bu yüzden "sisteme dön" artık çerezi silemez, silerse kullanıcı varsayılan koyuya düşer ve
 * işletim sistemi temasına dönemez (görev 33'teki hatanın yeni biçimi). Sunucu `system`
 * çerezinde `data-theme` yazmaz, CSS medya sorgusu karar verir.
 */
export function applyPreference(preference: ThemePreference) {
  if (preference === "system") {
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.setItem(THEME_STORAGE_KEY, "system");
    document.cookie = `${THEME_STORAGE_KEY}=system; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
  } else {
    document.documentElement.dataset.theme = preference;
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    document.cookie = `${THEME_STORAGE_KEY}=${preference}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
  }
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT));
}
