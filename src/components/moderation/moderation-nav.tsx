"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { moderationNavSections } from "@/config/navigation";

/**
 * Menüde "şu an buradasın" bilgisi yoktu; sayfalar bunu telafi etmek için kendi
 * içlerine ikinci bir gezinme satırı koymuştu. Aktiflik menüde söylenince o
 * yinelenen satırlara gerek kalmıyor.
 *
 * Eşleşme en uzun önekten seçiliyor: `/moderasyon` her rotanın öneki,
 * `/moderasyon/agentlar` da `/moderasyon/agentlar/olaylar`ın öneki. En uzun aday
 * kazanınca alt rotalar (`/moderasyon/agentlar/<id>/duzenle`) doğru üst
 * çalışma alanını işaretliyor, `/moderasyon` tüm konsolu birden yakmıyor.
 */
function activeHrefFor(pathname: string | null): string | null {
  if (!pathname) return null;
  let match: string | null = null;
  for (const section of moderationNavSections) {
    for (const { href } of section.links) {
      if (pathname !== href && !pathname.startsWith(`${href}/`)) continue;
      if (!match || href.length > match.length) match = href;
    }
  }
  return match;
}

export function ModerationLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const activeHref = activeHrefFor(usePathname());
  return (
    /*
     * Yönetim ekranları `page-main`'i kullanmıyor: o ölçü (760px) düzyazı için
     * kurulmuş, tablolar ve filtre satırları orada sıkışıyor. Konsol kendi
     * genişliğini alıyor; okuma sayfaları `page-main`'de kalıyor.
     */
    <main id="ana-icerik" className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="title-page">{title}</h1>
      <p className="mt-3 text-muted">{description}</p>
      <nav aria-label="Moderasyon menüsü" className="mt-6 space-y-3 border-b pb-4">
        {moderationNavSections.map((section) => (
          <div
            key={section.label}
            className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[6rem_minmax(0,1fr)]"
          >
            <span className="eyebrow px-1 py-2 leading-tight text-muted">{section.label}</span>
            <div className="flex min-w-0 flex-wrap gap-1">
              {section.links.map(({ href, label }) => {
                const active = href === activeHref;
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    /*
                     * Aktiflik dolguyla değil altta 2px'lik kiremit çizgiyle
                     * söyleniyor — kenar çubuğundaki satırlarla aynı dil. Çizgi
                     * her öğede duruyor, durgunken saydam: aktif olan öğe
                     * satırı aşağı kaydırmıyor. Bu bir link, buton değil;
                     * dolgu ve kenarlık yok.
                     *
                     * `after:bg-transparent` BİLEREK taban sınıfta değil, yalnız
                     * durgun dalda: iki `after:bg-*` aynı sınıf listesinde
                     * bulunursa özgüllük eşitlenir ve kazananı üretilen stil
                     * dosyasındaki sıra belirler. Taban sınıfta denendiğinde
                     * `transparent` kazandı, yani aktif çizgi hiç çizilmedi;
                     * dallara ayırınca çakışma tamamen ortadan kalkıyor.
                     */
                    className={`relative flex min-h-9 items-center rounded-lg px-2.5 py-2 text-sm font-medium leading-tight transition-colors after:absolute after:inset-x-2.5 after:bottom-1 after:h-[2px] after:transition-colors after:content-[''] ${
                      active
                        ? "text-primary after:bg-primary"
                        : "text-muted after:bg-transparent hover:text-ink hover:after:bg-[rgb(var(--border-strong))]"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-8">{children}</div>
    </main>
  );
}
