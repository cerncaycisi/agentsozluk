import { MAX_PAGE_SIZE } from "@/config/app";
import { MAX_SKIP } from "@/lib/http/pagination";

export const TOPIC_FEEDS = ["trending", "recent", "new", "popular"] as const;
export type TopicFeed = (typeof TOPIC_FEEDS)[number];

/*
  TOPLAM sınır 18 Eylül 2026'da kaldırıldı (Gökhan: "ekşide de normalsözlükte de
  sonsuz gibi bişi, bizde neden sınırlı?").

  Eski `TOPIC_FEED_MAX_ITEMS = 30` sayfa başına DEĞİL, akışın tamamı için geçerliydi:
  `boundedFeedWindow(30, 20)` → `take: 0`. Yani sol şerit ikinci sayfadan sonra boşalıyordu
  ve kullanıcı 30 başlıktan öteye hiç geçemiyordu. Kaynağı `bf70853` (17 Temmuz,
  "harden milestone concurrency and security") — sorguyu sınırsız büyümekten koruyan bir
  emniyet kelepçesi. Ürün kararı olarak alınmış değildi; referans sözlüklerde böyle bir
  sınır yok.

  Ölçülen SEO bedeli (18 Eylül, Googlebot kimliğiyle canlı): bütün keşif sayfalarının
  HTML'inde toplam 63 tekil başlık linki vardı, sitemap'te 5.835 başlık — yani
  başlıkların %98,9'una hiçbir iç link gitmiyordu.

  Emniyet KALDIRILMADI, zaten var olan GENEL sınırlara bağlandı: `MAX_PAGE_SIZE`
  ve `MAX_SKIP`. İlk yazımda buraya ayrı bir 50/10.000 çifti koymuştum; Astra
  (18 Eylül) bunun API sözleşmesini böldüğünü ölçtü — `?pageSize=100` isteğinde
  genel ayrıştırıcı 100'ü kabul edip `skip`i ona göre hesaplıyor, repository ise
  50'ye kırpıyordu, yani sayfalar birbirinin üstüne biniyordu. Tek sınır kümesi
  bu ayrışmayı imkânsız kılar.
*/
export function boundedFeedWindow(skip: number, pageSize: number): { skip: number; take: number } {
  const boundedPageSize = Math.min(Math.max(0, pageSize), MAX_PAGE_SIZE);
  // Sınır aşımı akışı BİTİRİR; aynı pencereye kelepçelemek son sayfayı tekrar
  // tekrar gösterirdi (Astra 18 Eylül: 10.020 başlıkta sayfa 501, 502… aynı
  // 10.000 OFFSET'ine düşüyordu).
  if (skip > MAX_SKIP) return { skip: MAX_SKIP, take: 0 };
  return { skip: Math.max(0, skip), take: boundedPageSize };
}

export function topicFeedWindowStart(feed: TopicFeed, now: Date): Date {
  return feed === "trending" ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
}

/** Ana sayfadaki "başlık + o başlıktan tek entry" bloklarının sayısı. */
export const HOME_SAMPLER_BLOCK_COUNT = 10;

/**
 * Gündem sıralamasındaki bazı başlıklarda görüntülenebilir entry olmayabilir
 * (hepsi silinmiş ya da seed görünürlüğünden düşürülmüş olabilir). Bu yüzden
 * istenen blok sayısının katı kadar aday başlık çekilir; entry'si olmayanlar
 * elendikten sonra ilk `limit` tanesi gösterilir. Aday sayısı gündem akışının
 * kendi üst sınırını aşmaz.
 */
export function homeSamplerTopicCandidateCount(limit: number): number {
  return Math.min(MAX_PAGE_SIZE, Math.max(limit, limit * 3));
}
