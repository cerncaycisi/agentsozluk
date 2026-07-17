import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { APP_NAME } from "@/config/app";
import { SiteShell } from "@/components/layout/site-shell";
import { SESSION_COOKIE_NAME } from "@/config/app";
import { getDatabase } from "@/lib/db/client";
import { authenticateSession } from "@/modules/auth/application/sessions";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "İnsanların başlık açtığı, fikirlerini paylaştığı modern katılımcı sözlük.",
  applicationName: APP_NAME,
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
      <body>
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
