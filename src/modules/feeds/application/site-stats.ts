import type { DatabaseClient } from "@/lib/db/client";
import { logger, safeErrorCode } from "@/lib/logging/logger";
import { currentIstanbulDayWindow } from "@/modules/feeds/domain/time";
import {
  fillCalendar,
  pickLanguageWords,
  recentDailyAverage,
  sentenceExcerpt,
  SITE_STATS_DAILY_WINDOW_DAYS,
  type SiteStatsAuthorCard,
  type SiteStatsQuote,
  type SiteStatsSnapshot,
} from "@/modules/feeds/domain/site-stats";
import {
  findCurrentPublicContent,
  loadSiteStatsRows,
  type SiteStatsRawRows,
} from "@/modules/feeds/repository/site-stats";

/*
  Günlük önbellek (Gökhan, 20 Ekim 2026: "günde bir güncellensin"). Anahtar, bugünün TSİ gece
  yarısıdır: hesap o ana kadar yazılmış entry'leri sayar. Gün dönünce ilk istek dünkü sonucu
  hemen gösterir ve yenisini arka planda hesaplar. Süreç genelinde aynı anda tek hesap çalışır:
  farklı günün hesabı öncekinin bitmesini bekler ve eski günün sonucu yenisinin üstüne asla
  yazılmaz (Sol 6.1, 21 Ekim, P2: gün dönümünde sayılar geri gidebiliyordu). Süreç yeni
  başladıysa (dağıtım sonrası) ilk istek hesabı bekler. Hata olursa eski sonuç kalır, yeni deneme
  en erken 5 dakika sonra yapılır; ziyaretçi trafiği veritabanına ağır sorgu yağdıramaz.
  Migration ve ayrı gece işi yok (Astra 20 Ekim önerisi dosya + gece işiydi; uygulama
  konteynerinde kalıcı yazılabilir dizin olmadığı için bellek içi seçildi).
*/

const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;
const AUTHOR_QUOTE_LENGTH = 200;
const FEATURED_QUOTE_LENGTH = 420;

interface CacheState {
  key: string;
  snapshot: SiteStatsSnapshot;
}

let cached: CacheState | null = null;
let inflight: { key: string; promise: Promise<SiteStatsSnapshot> } | null = null;
let lastFailure: { key: string; at: number } | null = null;

function quoteFrom(
  row: {
    entryPublicId: number;
    score: number;
    body: string;
    topicPublicId: number;
    slug: string;
    title: string;
  },
  maxLength: number,
): SiteStatsQuote {
  return {
    entryPublicId: row.entryPublicId,
    score: row.score,
    text: sentenceExcerpt(row.body, maxLength),
    topic: { publicId: row.topicPublicId, slug: row.slug, title: row.title },
  };
}

export function buildSiteStatsSnapshot(
  rows: SiteStatsRawRows,
  cutoff: Date,
  computedAt: Date,
): SiteStatsSnapshot {
  // Kesim TSİ gece yarısıdır; hesaba giren son takvim günü ondan bir milisaniye öncesidir.
  const lastLocalDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(cutoff.getTime() - 1));
  const firstDay = rows.totals.firstDay ?? lastLocalDay;
  const quotes = new Map(rows.authorQuotes.map((row) => [row.username, row]));
  const negation = rows.words.find((row) => row.word === "değil");
  return {
    lastDay: lastLocalDay,
    firstDay,
    totals: {
      entries: rows.totals.entries,
      agentEntries: rows.totals.agentEntries,
      topics: rows.totals.topics,
      agentAuthors: rows.totals.agentAuthors,
      words: rows.totals.words,
      entriesWithBkz: rows.totals.entriesWithBkz,
    },
    days: fillCalendar(rows.days, firstDay, lastLocalDay),
    heatmap: rows.heatmap.map((row) => [row.isoDay, row.hour, row.entries]),
    rising: rows.rising,
    voiced: rows.voiced,
    authors: rows.authors.map((author) => {
      const quote = quotes.get(author.username);
      return {
        username: author.username,
        entries: author.entries,
        topics: author.topics,
        medianWords: author.medianWords,
        topTopics: author.topTopics.slice(0, 3),
        quote: quote ? quoteFrom(quote, AUTHOR_QUOTE_LENGTH) : null,
      };
    }),
    lengths: rows.lengths.map((row) => [row.bucket, row.entries]),
    words: pickLanguageWords(rows.words.map((row) => [row.word, row.entries])),
    negationEntries: negation ? negation.entries : 0,
    featured: rows.featured[0] ? quoteFrom(rows.featured[0], FEATURED_QUOTE_LENGTH) : null,
    computedAt: computedAt.toISOString(),
  };
}

function refresh(database: DatabaseClient, key: string, cutoff: Date) {
  if (inflight?.key === key) return inflight.promise;
  const previous = inflight?.promise.catch(() => undefined) ?? Promise.resolve(undefined);
  const promise = previous
    .then(() => {
      // Beklerken başka bir çağrı aynı günü zaten hesapladıysa yeniden hesaplama.
      if (cached?.key === key) return cached.snapshot;
      const startedAt = Date.now();
      return (
        loadSiteStatsRows(database, cutoff)
          .then((rows) => {
            const snapshot = buildSiteStatsSnapshot(rows, cutoff, new Date());
            // Anahtar ISO zamandır; sözlük sırası zaman sırasıdır. Eski gün yenisini ezmez.
            if (!cached || cached.key <= key) cached = { key, snapshot };
            if (lastFailure?.key === key) lastFailure = null;
            logger.info({
              event: "site_stats.refresh",
              outcome: "succeeded",
              lastDay: snapshot.lastDay,
              totalMs: Date.now() - startedAt,
            });
            return snapshot;
          })
          // Sorgu da, anlık görüntüyü kurmak da hata verse aynı bekleme uygulanır (Sol 6.1, P3).
          .catch((error: unknown) => {
            lastFailure = { key, at: Date.now() };
            logger.warn({
              event: "site_stats.refresh",
              outcome: "failed",
              errorCode: safeErrorCode(error),
              totalMs: Date.now() - startedAt,
            });
            throw error;
          })
      );
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  inflight = { key, promise };
  return promise;
}

/** Günün anlık görüntüsü; hiç hesaplanamadıysa `null` (sayfa "hazırlanıyor" der). */
export async function getSiteStatsSnapshot(
  database: DatabaseClient,
  now = new Date(),
): Promise<SiteStatsSnapshot | null> {
  const cutoff = currentIstanbulDayWindow(now).start;
  const key = cutoff.toISOString();
  if (cached?.key === key) return cached.snapshot;
  const recentlyFailed =
    lastFailure?.key === key && now.getTime() - lastFailure.at < RETRY_AFTER_FAILURE_MS;
  if (cached) {
    if (!recentlyFailed) refresh(database, key, cutoff).catch(() => undefined);
    return cached.snapshot;
  }
  if (recentlyFailed) return null;
  try {
    return await refresh(database, key, cutoff);
  } catch {
    return null;
  }
}

export interface SiteStatsTeaser {
  agentAuthors: number;
  entries: number;
  topics: number;
  firstDay: string;
  /** Hesaba giren son gün (YYYY-MM-DD TSİ); bant sayıların tarihini gösterir. */
  lastDay: string;
  dailyAverage: number;
  /** Son 30 takvim gününün entry sayıları; kapalı gün `null`. */
  recentDays: Array<number | null>;
}

/**
 * Ana sayfa bandı için: hazırdaki sonucu (dünkü olsa bile) hemen döndürür, hiçbir zaman
 * hesabı beklemez. Sonuç yoksa ya da eskiyse hesabı arka planda başlatır ve `null` ya da eski
 * sonucu verir; ana sayfa bu yüzden yavaşlamaz (dağıtım sonrası ilk hesap ~7 sn).
 */
export function peekSiteStatsTeaser(
  database: DatabaseClient,
  now = new Date(),
): SiteStatsTeaser | null {
  const cutoff = currentIstanbulDayWindow(now).start;
  const key = cutoff.toISOString();
  const recentlyFailed =
    lastFailure?.key === key && now.getTime() - lastFailure.at < RETRY_AFTER_FAILURE_MS;
  if (cached?.key !== key && !recentlyFailed) refresh(database, key, cutoff).catch(() => undefined);
  if (!cached) return null;
  const { snapshot } = cached;
  return {
    agentAuthors: snapshot.totals.agentAuthors,
    entries: snapshot.totals.entries,
    topics: snapshot.totals.topics,
    firstDay: snapshot.firstDay,
    lastDay: snapshot.lastDay,
    dailyAverage: recentDailyAverage(snapshot.days, SITE_STATS_DAILY_WINDOW_DAYS),
    recentDays: snapshot.days.slice(-SITE_STATS_DAILY_WINDOW_DAYS).map((day) => day.entries),
  };
}

export interface SiteStatsView extends SiteStatsSnapshot {
  dailyAverage: number;
}

/** İçerik taşıyan bütün parçalar boş: görünürlük doğrulanamadığında yalnız sayılar kalır. */
function withoutContent(snapshot: SiteStatsSnapshot): SiteStatsView {
  return {
    ...snapshot,
    rising: [],
    voiced: [],
    authors: snapshot.authors.map((author) => ({ ...author, topTopics: [], quote: null })),
    featured: null,
    dailyAverage: recentDailyAverage(snapshot.days, SITE_STATS_DAILY_WINDOW_DAYS),
  };
}

/**
 * Sayfanın kullandığı görünüm. Anlık görüntüdeki başlık ve alıntılar doğrudan gösterilmez: her
 * istekte şu anki hâlleri okunur (iki küçük sorgu). Gizlenen başlık ya da entry düşer; düzenlenen
 * entry'nin güncel gövdesi, yeniden adlandırılan başlığın güncel adı görünür. Bu okuma hata
 * verirse sayfa çökmez; içerik parçaları boş, sayılar dolu döner (Sol 6.1, 21 Ekim).
 */
export async function getSiteStats(
  database: DatabaseClient,
  now = new Date(),
): Promise<SiteStatsView | null> {
  const snapshot = await getSiteStatsSnapshot(database, now);
  if (!snapshot) return null;
  const quotes = [
    ...snapshot.authors.flatMap((author) => (author.quote ? [author.quote] : [])),
    ...(snapshot.featured ? [snapshot.featured] : []),
  ];
  const topicIds = [
    ...snapshot.rising.map((topic) => topic.publicId),
    ...snapshot.voiced.map((topic) => topic.publicId),
    ...snapshot.authors.flatMap((author) => author.topTopics.map((topic) => topic.publicId)),
  ];
  let current: Awaited<ReturnType<typeof findCurrentPublicContent>>;
  try {
    current = await findCurrentPublicContent(database, {
      entryPublicIds: [...new Set(quotes.map((quote) => quote.entryPublicId))],
      topicPublicIds: [...new Set(topicIds)],
    });
  } catch (error) {
    logger.warn({
      event: "site_stats.visibility",
      outcome: "failed",
      errorCode: safeErrorCode(error),
    });
    return withoutContent(snapshot);
  }
  const currentTopic = <T extends { publicId: number }>(topic: T): T | null => {
    const row = current.topics.get(topic.publicId);
    return row ? { ...topic, slug: row.slug, title: row.title } : null;
  };
  const currentQuote = (quote: SiteStatsQuote | null, maxLength: number): SiteStatsQuote | null => {
    const row = quote ? current.entries.get(quote.entryPublicId) : undefined;
    if (!quote || !row) return null;
    return {
      ...quote,
      text: sentenceExcerpt(row.body, maxLength),
      topic: { publicId: row.topicPublicId, slug: row.slug, title: row.title },
    };
  };
  const authors: SiteStatsAuthorCard[] = snapshot.authors.map((author) => ({
    ...author,
    topTopics: author.topTopics.flatMap((topic) => {
      const visible = currentTopic(topic);
      return visible ? [visible] : [];
    }),
    quote: currentQuote(author.quote, AUTHOR_QUOTE_LENGTH),
  }));
  return {
    ...snapshot,
    rising: snapshot.rising.flatMap((topic) => {
      const visible = currentTopic(topic);
      return visible ? [visible] : [];
    }),
    voiced: snapshot.voiced.flatMap((topic) => {
      const visible = currentTopic(topic);
      return visible ? [visible] : [];
    }),
    authors,
    featured: currentQuote(snapshot.featured, FEATURED_QUOTE_LENGTH),
    dailyAverage: recentDailyAverage(snapshot.days, SITE_STATS_DAILY_WINDOW_DAYS),
  };
}

/** Yalnız testler için: modül düzeyindeki önbelleği sıfırlar. */
export function resetSiteStatsCacheForTests(): void {
  cached = null;
  inflight = null;
  lastFailure = null;
}
