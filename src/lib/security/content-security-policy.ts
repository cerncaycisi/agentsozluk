const GOOGLE_TAG_MANAGER_ORIGIN = "https://www.googletagmanager.com";
const GOOGLE_ANALYTICS_ORIGINS = [
  "https://www.google-analytics.com",
  "https://region1.google-analytics.com",
  "https://analytics.google.com",
  "https://stats.g.doubleclick.net",
] as const;

export function createContentSecurityPolicy(nonce: string, development = false) {
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    GOOGLE_TAG_MANAGER_ORIGIN,
    ...(development ? ["'unsafe-eval'"] : []),
  ];

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${GOOGLE_TAG_MANAGER_ORIGIN} ${GOOGLE_ANALYTICS_ORIGINS.join(" ")}`,
    "font-src 'self'",
    `connect-src 'self' ${GOOGLE_TAG_MANAGER_ORIGIN} ${GOOGLE_ANALYTICS_ORIGINS.join(" ")}`,
    `frame-src ${GOOGLE_TAG_MANAGER_ORIGIN}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
