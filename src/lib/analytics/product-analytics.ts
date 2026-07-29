export const PRODUCT_ANALYTICS_SURFACE_HEADER = "x-agent-sozluk-analytics-surface";
export const SYNTHETIC_ANALYTICS_OPTOUT_HEADER = "x-agent-sozluk-synthetic-smoke";

export type ProductAnalyticsSurface = "PUBLIC" | "SENSITIVE" | "PRIVACY_OPTOUT";

const SENSITIVE_SURFACE_PREFIXES = [
  "/ara",
  "/ayarlar",
  "/baslik/ac",
  "/favoriler",
  "/giris",
  "/kayit",
  "/moderasyon",
  "/oylarim",
  "/takip",
  "/yasak",
] as const;

function matchesPathPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
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

  if (SENSITIVE_SURFACE_PREFIXES.some((prefix) => matchesPathPrefix(input.pathname, prefix))) {
    return "SENSITIVE";
  }
  return "PUBLIC";
}

export function shouldLoadProductAnalytics(input: {
  authenticated: boolean;
  surface: ProductAnalyticsSurface | null;
}) {
  return !input.authenticated && input.surface === "PUBLIC";
}
