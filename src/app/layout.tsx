import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { APP_NAME } from "@/config/app";
import { SiteHeader } from "@/components/layout/site-header";
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
  const theme = (await cookies()).get("ajan_theme")?.value;
  const themeAttribute = theme === "light" || theme === "dark" ? theme : undefined;

  return (
    <html lang="tr" data-theme={themeAttribute} suppressHydrationWarning>
      <body>
        <a
          href="#ana-icerik"
          className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-lg bg-primary px-4 py-2 font-semibold text-white focus:translate-y-0"
        >
          Ana içeriğe geç
        </a>
        <SiteHeader />
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
