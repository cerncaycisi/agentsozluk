import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { cookies, headers } from "next/headers";
import { Toaster } from "sonner";
import { APP_NAME } from "@/config/app";
import { ProductAnalytics } from "@/components/analytics/product-analytics";
import { JsonLd } from "@/components/seo/json-ld";
import { SiteShell } from "@/components/layout/site-shell";
import { SESSION_COOKIE_NAME } from "@/config/app";
import {
  PRODUCT_ANALYTICS_SURFACE_HEADER,
  shouldLoadProductAnalytics,
  type ProductAnalyticsSurface,
} from "@/lib/analytics/product-analytics";
import { getDatabase } from "@/lib/db/client";
import { authenticateSession } from "@/modules/auth/application/sessions";
import { buildWebsiteJsonLd } from "@/modules/indexing/domain/public-seo";
import "./globals.css";

/**
 * Ürünün tamamı metin; yazı tipi bir tercih değil altyapı. `next/font` build sırasında
 * indirip kendi origin'imizden servis ediyor — CSP `font-src 'self'` olduğu için
 * dışarıdan çekmek zaten mümkün değil.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "İnsanların başlık açtığı, fikirlerini paylaştığı modern katılımcı sözlük.",
  applicationName: APP_NAME,
  alternates: {
    types: {
      "application/rss+xml": "/feed.xml",
      "application/atom+xml": "/atom.xml",
    },
  },
  openGraph: {
    title: APP_NAME,
    description: "Başlıkların fikirlerle, fikirlerin insanlarla buluştuğu katılımcı sözlük.",
    type: "website",
    locale: "tr_TR",
  },
};

export const viewport: Viewport = { colorScheme: "light dark", themeColor: "#5B5BD6" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const theme = cookieStore.get("ajan_theme")?.value;
  const themeAttribute = theme === "light" || theme === "dark" ? theme : undefined;
  const session = await authenticateSession(
    getDatabase(),
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
    { extendExpiration: false },
  );
  const viewer = session
    ? {
        username: session.user.username,
        displayName: session.user.displayName,
        role: session.user.role,
      }
    : null;
  const analyticsSurface = requestHeaders.get(
    PRODUCT_ANALYTICS_SURFACE_HEADER,
  ) as ProductAnalyticsSurface | null;
  const analyticsEnabled = shouldLoadProductAnalytics({
    authenticated: Boolean(session),
    surface: analyticsSurface,
  });
  const nonce = requestHeaders.get("x-nonce") ?? undefined;

  return (
    <html
      lang="tr"
      data-theme={themeAttribute}
      className={plexSans.variable}
      suppressHydrationWarning
    >
      <head>
        <JsonLd data={buildWebsiteJsonLd(process.env.APP_URL ?? "http://localhost:3000")} />
      </head>
      <body>
        <ProductAnalytics enabled={analyticsEnabled} nonce={nonce} />
        <a
          href="#ana-icerik"
          className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-lg bg-primary px-4 py-2 font-semibold text-on-primary focus:translate-y-0"
        >
          Ana içeriğe geç
        </a>
        <SiteShell viewer={viewer}>{children}</SiteShell>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
