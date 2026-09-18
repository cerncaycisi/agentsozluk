import { getEnvironment } from "@/config/env";
import { getDatabase } from "@/lib/db/client";
import { escapeXml, xmlResponse } from "@/lib/http/xml";
import { getSitemapTopicCount } from "@/modules/indexing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOPICS_PER_SITEMAP = 50_000;

/*
  ENTRY SITEMAP'İ KALDIRILDI — 18 Eylül 2026.

  Sitemap KANONİK adresleri listeler. `/entry/N` artık kendi başlık sayfasına
  canonical veriyor (gerekçe `entry/[id]/page.tsx` başlığında), dolayısıyla onu
  sitemap'te tutmak Google'a çelişkili sinyal vermek olurdu: "bu adres önemli"
  deyip aynı adreste "asıl adres şu" demek.

  Ölçülen bedel buydu: sitemap'in %76'sı (18.515 URL) kopya sayfalara gidiyordu
  ve tarama bütçesi oraya dağılıyordu. Başlık sayfalaması artık indekslenebilir
  olduğu için her entry'nin metni zaten bir kanonik adreste bulunuyor.

  Sayfalar SİLİNMEDİ; dışarıdan verilmiş linkler çalışmaya devam ediyor ve
  crawler onlara iç linklerden ulaşabiliyor. Yalnız "bunu dizine al" çağrısı
  geri çekildi.
*/
export async function GET() {
  const baseUrl = getEnvironment().APP_URL;
  const topicCount = await getSitemapTopicCount(getDatabase());
  const topicPages = Math.ceil(topicCount / TOPICS_PER_SITEMAP);
  const locations = [
    `${baseUrl}/sitemaps/static.xml`,
    ...Array.from({ length: topicPages }, (_, page) => `${baseUrl}/sitemaps/topics/${page}.xml`),
  ];
  const items = locations
    .map((location) => `<sitemap><loc>${escapeXml(location)}</loc></sitemap>`)
    .join("");
  return xmlResponse(
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</sitemapindex>`,
  );
}
