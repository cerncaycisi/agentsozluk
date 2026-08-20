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

export const THEME_NAME: Record<ThemePreference, string> = {
  system: "sistem",
  light: "açık",
  dark: "koyu",
};

export function isExplicitTheme(value: string | null | undefined): value is ResolvedTheme {
  return value === "light" || value === "dark";
}

export function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readPreference(): ThemePreference {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isExplicitTheme(saved)) return saved;
  // Sunucu cookie'den `data-theme` yazdıysa localStorage boş olsa da onu esas al.
  const rendered = document.documentElement.dataset.theme;
  if (isExplicitTheme(rendered)) return rendered;
  return "system";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

/**
 * KRİTİK — `system` dalı üç kaydı birden temizler: `data-theme` attribute'u,
 * localStorage ve cookie. Üçünden biri kalırsa kullanıcı bir yıllık cookie'ye
 * saplanır ve işletim sistemi temasına bir daha dönemez. Görev 33'te düzeltilen
 * hata tam olarak buydu; bu dal silinmez, yalnız çağıran yer değişti (düğme
 * döngüsünden ayarlar sayfasına).
 */
export function applyPreference(preference: ThemePreference) {
  if (preference === "system") {
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    document.cookie = `${THEME_STORAGE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
  } else {
    document.documentElement.dataset.theme = preference;
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    document.cookie = `${THEME_STORAGE_KEY}=${preference}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
  }
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT));
}
