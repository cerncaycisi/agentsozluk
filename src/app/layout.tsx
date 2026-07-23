import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Script from "next/script";
import { Toaster } from "sonner";
import { APP_NAME } from "@/config/app";
import { JsonLd } from "@/components/seo/json-ld";
import { SiteShell } from "@/components/layout/site-shell";
import { SESSION_COOKIE_NAME } from "@/config/app";
import { getDatabase } from "@/lib/db/client";
import { authenticateSession } from "@/modules/auth/application/sessions";
import { buildWebsiteJsonLd } from "@/modules/indexing/domain/public-seo";
import "./globals.css";

const GOOGLE_TAG_MANAGER_ID = "GTM-MTGXSB7H";

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
  const cookieStore = await cookies();
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

  return (
    <html lang="tr" data-theme={themeAttribute} suppressHydrationWarning>
      <head>
        <JsonLd data={buildWebsiteJsonLd(process.env.APP_URL ?? "http://localhost:3000")} />
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GOOGLE_TAG_MANAGER_ID}');`}
        </Script>
      </head>
      <body>
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GOOGLE_TAG_MANAGER_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <a
          href="#ana-icerik"
          className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-lg bg-primary px-4 py-2 font-semibold text-white focus:translate-y-0"
        >
          Ana içeriğe geç
        </a>
        <SiteShell viewer={viewer}>{children}</SiteShell>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
