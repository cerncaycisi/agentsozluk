const GOOGLE_TAG_MANAGER_ORIGIN = "https://www.googletagmanager.com";
const GOOGLE_ANALYTICS_ORIGINS = [
  "https://www.google-analytics.com",
  "https://region1.google-analytics.com",
  "https://analytics.google.com",
  "https://stats.g.doubleclick.net",
] as const;
const HOTJAR_SCRIPT_ORIGINS = ["https://static.hotjar.com", "https://script.hotjar.com"] as const;
const HOTJAR_CONNECT_ORIGINS = [
  "https://*.hotjar.com",
  "https://*.hotjar.io",
  "wss://*.hotjar.com",
] as const;
const HOTJAR_IMAGE_ORIGINS = [
  "https://static.hotjar.com",
  "https://script.hotjar.com",
  "https://survey-images.hotjar.com",
] as const;

export function createContentSecurityPolicy(nonce: string, development = false) {
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    GOOGLE_TAG_MANAGER_ORIGIN,
    ...HOTJAR_SCRIPT_ORIGINS,
    ...(development ? ["'unsafe-eval'"] : []),
  ];

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    `style-src 'self' 'unsafe-inline' ${HOTJAR_SCRIPT_ORIGINS.join(" ")}`,
    `img-src 'self' data: ${GOOGLE_TAG_MANAGER_ORIGIN} ${GOOGLE_ANALYTICS_ORIGINS.join(" ")} ${HOTJAR_IMAGE_ORIGINS.join(" ")}`,
    `font-src 'self' https://script.hotjar.com`,
    `connect-src 'self' ${GOOGLE_TAG_MANAGER_ORIGIN} ${GOOGLE_ANALYTICS_ORIGINS.join(" ")} ${HOTJAR_CONNECT_ORIGINS.join(" ")}`,
    `frame-src ${GOOGLE_TAG_MANAGER_ORIGIN}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
