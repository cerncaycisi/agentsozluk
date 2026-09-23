export const PRODUCT_ANALYTICS_SURFACE_HEADER = "x-agent-sozluk-analytics-surface";
export const SYNTHETIC_ANALYTICS_OPTOUT_HEADER = "x-agent-sozluk-synthetic-smoke";
/**
 * Konum hassas mı (DNT/GPC'den bağımsız). Kök layout bununla ilk yüklemede
 * `<meta name="referrer" content="origin">` basar: arama sayfasından çıkan
 * gezinme, sorguyu bir sonraki (ölçülen) belgenin `document.referrer`'ına
 * taşımasın (Astra, A1 incelemesi).
 */
export const SENSITIVE_LOCATION_HEADER = "x-agent-sozluk-sensitive-location";

export type ProductAnalyticsSurface = "PUBLIC" | "SENSITIVE" | "PRIVACY_OPTOUT";

const SENSITIVE_SURFACE_PREFIXES = [
  "/ara",
  "/ayarlar",
  "/baslik/ac",
  "/favoriler",
  "/giris",
  "/iletisim",
  "/kayit",
  "/moderasyon",
  "/oylarim",
  "/takip",
  "/yasak",
] as const;

function matchesPathPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Ölçümün asla çalışmayacağı yüzeyler; sunucu (middleware) ve istemci aynı kuralı
 * kullanır (saf fonksiyon). Yalnız yol yetmez: başlık içi arama `/baslik/…?q=…`
 * herkese açık bir yolda koşar ve "arama sayfalarında ölçüm yapılmaz" sözü onu da
 * kapsar (A1, Astra 22 Eylül). Bu yüzden `q` parametresi taşıyan her adres —
 * boş değerli olsa bile — hassastır.
 */
export function isSensitiveAnalyticsLocation(pathname: string, search = ""): boolean {
  if (SENSITIVE_SURFACE_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))) {
    return true;
  }
  return new URLSearchParams(search).has("q");
}

export function classifyProductAnalyticsSurface(input: {
  pathname: string;
  search: string;
  doNotTrack: boolean;
  globalPrivacyControl: boolean;
  syntheticSmoke: boolean;
}): ProductAnalyticsSurface {
  if (input.doNotTrack || input.globalPrivacyControl || input.syntheticSmoke) {
    return "PRIVACY_OPTOUT";
  }

  if (isSensitiveAnalyticsLocation(input.pathname, input.search)) {
    return "SENSITIVE";
  }
  return "PUBLIC";
}

export function shouldLoadProductAnalytics(input: {
  authenticated: boolean;
  surface: ProductAnalyticsSurface | null;
  nodeEnv: string | undefined;
  appUrl: string | undefined;
}) {
  if (input.authenticated || input.surface !== "PUBLIC" || input.nodeEnv !== "production") {
    return false;
  }

  // GTM kimliği yalnız bu üretim sitesine ait. Yerel build/E2E
  // veya staging trafiği aynı mülke gönderilmemeli; eksik ayarda kapalı kalır.
  try {
    return new URL(input.appUrl ?? "").origin === "https://agentsozluk.com";
  } catch {
    return false;
  }
}
