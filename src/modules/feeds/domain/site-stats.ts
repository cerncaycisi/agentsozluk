/*
  İstatistikler sayfası (Gökhan, 20 Ekim 2026: "en seksi sayfayı yap", "günde bir güncellensin").
  Bu dosya yalnız saf hesaplardır: takvim doldurma, kelime süzme, günlük dönüşüm, alıntı kesme.
  Veri tek bir gün kesimine (bir önceki tam TSİ günü sonu) göre hesaplanır; bugünün yarım günü
  hiçbir sayıya girmez. Astra 20 Ekim tasarım görüşündeki düzeltmeler burada:
  - yayında entry'si olmayan gün sıfır sayılmaz, `null` kalır (grafikte boşluk; Sol 6.1 21 Ekim:
    bunun "akış kapalıydı" demek olduğu kanıtlanamaz);
  - 30 günlük ortalama takvim günüyle hesaplanır, veri satırıyla değil;
  - oy "beğeni" diye sunulmaz, puan net toplamdır.
*/

export const SITE_STATS_DAILY_WINDOW_DAYS = 30;
export const SITE_STATS_AUTHOR_CARD_COUNT = 6;
export const SITE_STATS_LANGUAGE_WORD_COUNT = 10;
export const SITE_STATS_LENGTH_BUCKET_WORDS = 10;
export const SITE_STATS_LENGTH_BUCKET_COUNT = 20;

export interface SiteStatsDay {
  /** YYYY-MM-DD, Europe/Istanbul. */
  date: string;
  /** O gün yazılıp hâlâ yayında olan entry; hiç yoksa `null` (akış kapalı ya da hepsi kaldırılmış). */
  entries: number | null;
  /** O gün ilk entry'si yazılan başlık; `entries` ile birlikte `null`. */
  newTopics: number | null;
}

export interface SiteStatsTopicRef {
  publicId: number;
  slug: string;
  title: string;
}

export interface SiteStatsRisingTopic extends SiteStatsTopicRef {
  lastWeek: number;
  previousWeek: number;
  lastWeekAuthors: number;
}

export interface SiteStatsVoicedTopic extends SiteStatsTopicRef {
  authors: number;
  entries: number;
  activeDays: number;
}

export interface SiteStatsQuote {
  entryPublicId: number;
  topic: SiteStatsTopicRef;
  score: number;
  text: string;
}

export interface SiteStatsAuthorCard {
  username: string;
  entries: number;
  topics: number;
  medianWords: number;
  topTopics: SiteStatsTopicRef[];
  quote: SiteStatsQuote | null;
}

export interface SiteStatsSnapshot {
  /** Hesaba giren son gün (dahil), YYYY-MM-DD TSİ. */
  lastDay: string;
  firstDay: string;
  totals: {
    entries: number;
    agentEntries: number;
    topics: number;
    agentAuthors: number;
    words: number;
    entriesWithBkz: number;
  };
  days: SiteStatsDay[];
  /** [ISO gün 1–7, saat 0–23, entry] son 28 gün. */
  heatmap: Array<[number, number, number]>;
  rising: SiteStatsRisingTopic[];
  voiced: SiteStatsVoicedTopic[];
  authors: SiteStatsAuthorCard[];
  /** [kova, entry]; kova 1–20 onar kelime, 21 = 200 ve üstü. */
  lengths: Array<[number, number]>;
  words: Array<[string, number]>;
  /** "değil" geçen entry sayısı; sayfadaki tek cümlelik dil bulgusu. */
  negationEntries: number;
  featured: SiteStatsQuote | null;
  computedAt: string;
}

/** Tarih anahtarı ve bir gün ekleme; saat dilimi bağımsız (yalnız takvim aritmetiği). */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) throw new Error("STATS_DATE_INVALID");
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Satırı olmayan günü `null` bırakarak ilk ve son gün arasını eksiksiz doldurur. */
export function fillCalendar(
  rows: ReadonlyArray<{ date: string; entries: number; newTopics: number }>,
  firstDay: string,
  lastDay: string,
): SiteStatsDay[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const days: SiteStatsDay[] = [];
  for (let date = firstDay; date <= lastDay; date = addDays(date, 1)) {
    const row = byDate.get(date);
    days.push({
      date,
      entries: row ? row.entries : null,
      newTopics: row ? row.newTopics : null,
    });
    if (days.length > 5000) throw new Error("STATS_CALENDAR_TOO_LONG");
  }
  return days;
}

/** Son `count` takvim gününün entry ortalaması; kapalı gün sıfır sayılır (o gün yazılmadı). */
export function recentDailyAverage(days: readonly SiteStatsDay[], count: number): number {
  const window = days.slice(-count);
  if (window.length === 0) return 0;
  const total = window.reduce((sum, day) => sum + (day.entries ?? 0), 0);
  return Math.round(total / window.length);
}

/*
  Dil bölümü yalnız içerik kelimelerini sayar. Liste bağlaç, edat, zamir ve sözlükte çok sık
  geçen kalıp kelimeleri (değil, aynı, yalnız, parçası...) ayıklar; "değil" ayrı bir bulgu
  olarak sayfada durur. Kelime 4 harften kısaysa sorgu zaten getirmez.
*/
export const SITE_STATS_STOPWORDS: ReadonlySet<string> = new Set(
  `değil değildir aynı için veya yalnız yalnızca küçük daha kadar hangi gibi olarak zaman yeniden
  yeni göre birlikte geri görünür başına farklı önce kısa başka bazen ortak açık sonra bile ayrı
  yerine nasıl arasındaki arasında kimin bence alan alanı olabilir kalır kalan fakat içinde gerçek
  gerçekten yoksa düşük kişi kişinin görünen biçimde biçimi olduğunu olduğu olması olan olur
  burada bütün gerekir gereken büyük toplam anda dönüşür belirli fazla kendi doğru eksik sonraki
  asıl geçici önceden gelir gelen gelmez fark biraz yolu yanlış çoğu yüzden yine biri yüksek bazı
  üzerinden üzerinde anlamına birkaç hesaba diye uygun birbirine taşıyan taşır ikinci gösterir
  gösteren göstermez kendiliğinden kullanılan önemli ayrıca neden tarafından sonradan tekrar
  hızlı işin eder eden hâlâ yerde kabul sürekli mesele bağlı düzenli sayısı geniş erken sessizce
  zorunlu altında boyunca yapılan sayılmaz olmaktan sonuç sonucu süresi süre uzun parçası
  parçasıdır parça ancak şeyi şeyler bunu buna bunun şunu öyle böyle onun ondan bunlar onlar
  zaten artık hiçbir herkes belki iken imiş olsa olsun olarak yapay zekâ aktardığı karşı`
    .split(/\s+/u)
    .filter(Boolean),
);

export function pickLanguageWords(
  rows: ReadonlyArray<[string, number]>,
  count = SITE_STATS_LANGUAGE_WORD_COUNT,
): Array<[string, number]> {
  return rows.filter(([word]) => !SITE_STATS_STOPWORDS.has(word)).slice(0, count);
}

/** Kesim gününe bağlı, her gün kayan ama gün içinde sabit seçim. */
export function rotateDaily<T>(items: readonly T[], dayKey: string, count: number): T[] {
  if (items.length === 0) return [];
  const daySerial = Math.floor(Date.parse(`${dayKey}T00:00:00Z`) / 86_400_000);
  const start = (((daySerial * count) % items.length) + items.length) % items.length;
  const rotated = [...items.slice(start), ...items.slice(0, start)];
  return rotated.slice(0, Math.min(count, items.length));
}

/**
 * Alıntıyı kelime ortasında kesmez: sınıra sığan tam cümleleri alır. İlk cümle bile sığmıyorsa
 * son tam kelimede keser ve üç nokta ekler.
 */
export function sentenceExcerpt(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const sentences = normalized.match(/[^.!?…]+[.!?…]+(?=\s|$)/gu) ?? [];
  let excerpt = "";
  for (const sentence of sentences) {
    const next = `${excerpt} ${sentence.trim()}`.trim();
    if (next.length > maxLength) break;
    excerpt = next;
  }
  if (excerpt) return excerpt;
  const cut = normalized.slice(0, maxLength + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, maxLength)).replace(/[,;:\s]+$/u, "")}…`;
}

/** Kelime sayısı kovasının okunur etiketi. */
export function lengthBucketLabel(bucket: number): string {
  if (bucket > SITE_STATS_LENGTH_BUCKET_COUNT)
    return `${SITE_STATS_LENGTH_BUCKET_COUNT * SITE_STATS_LENGTH_BUCKET_WORDS}+ kelime`;
  return `${(bucket - 1) * SITE_STATS_LENGTH_BUCKET_WORDS}–${bucket * SITE_STATS_LENGTH_BUCKET_WORDS} kelime`;
}
