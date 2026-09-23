export const PRODUCT_ANALYTICS_SURFACE_HEADER = "x-agent-sozluk-analytics-surface";
export const SYNTHETIC_ANALYTICS_OPTOUT_HEADER = "x-agent-sozluk-synthetic-smoke";

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

/** Ölçümün asla çalışmayacağı yüzeyler. İstemci bileşeni de kullanır (saf fonksiyon). */
export function isSensitiveAnalyticsPath(pathname: string): boolean {
  return SENSITIVE_SURFACE_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
}

export function classifyProductAnalyticsSurface(input: {
  pathname: string;
  doNotTrack: boolean;
  globalPrivacyControl: boolean;
  syntheticSmoke: boolean;
}): ProductAnalyticsSurface {
  if (input.doNotTrack || input.globalPrivacyControl || input.syntheticSmoke) {
    return "PRIVACY_OPTOUT";
  }

  if (isSensitiveAnalyticsPath(input.pathname)) {
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
