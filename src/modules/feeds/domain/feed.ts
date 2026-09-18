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

  Emniyet KALDIRILMADI, doğru yere taşındı: istek başına sayfa boyutu hâlâ sınırlı
  (tek sorgunun büyüklüğünü bu belirler) ve derinlik `MAX_SKIP` ile bağlı — sınırsız
  `OFFSET` taraması pahalıdır ve o derinlikte gerçek kullanıcı yoktur.
*/
export const TOPIC_FEED_MAX_PAGE_SIZE = 50;
export const TOPIC_FEED_MAX_SKIP = 10_000;

export function boundedFeedWindow(skip: number, pageSize: number): { skip: number; take: number } {
  const boundedSkip = Math.min(Math.max(0, skip), TOPIC_FEED_MAX_SKIP);
  return {
    skip: boundedSkip,
    take: Math.min(Math.max(0, pageSize), TOPIC_FEED_MAX_PAGE_SIZE),
  };
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
  return Math.min(TOPIC_FEED_MAX_PAGE_SIZE, Math.max(limit, limit * 3));
}
