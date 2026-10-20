import type { DatabaseClient } from "@/lib/db/client";
import { logger, safeErrorCode } from "@/lib/logging/logger";
import { currentIstanbulDayWindow } from "@/modules/feeds/domain/time";
import {
  fillCalendar,
  pickLanguageWords,
  recentDailyAverage,
  sentenceExcerpt,
  SITE_STATS_DAILY_WINDOW_DAYS,
  type SiteStatsQuote,
  type SiteStatsSnapshot,
} from "@/modules/feeds/domain/site-stats";
import {
  findStillPublicIds,
  loadSiteStatsRows,
  type SiteStatsRawRows,
} from "@/modules/feeds/repository/site-stats";

/*
  Günlük önbellek (Gökhan, 20 Ekim 2026: "günde bir güncellensin"). Anahtar, bugünün TSİ gece
  yarısıdır: hesap o ana kadar yazılmış entry'leri sayar. Gün dönünce ilk istek dünkü sonucu
  hemen gösterir ve yenisini arka planda hesaplar; aynı anda tek hesap çalışır. Süreç yeni
  başladıysa (dağıtım sonrası) ilk istek hesabı bekler. Hata olursa eski sonuç kalır, yeni deneme
  en erken 5 dakika sonra yapılır; ziyaretçi trafiği veritabanına ağır sorgu yağdıramaz.
  Migration ve ayrı gece işi yok (Astra 20 Ekim önerisi dosya + gece işiydi; uygulama
  konteynerinde kalıcı yazılabilir dizin olmadığı için bellek içi seçildi).
*/

const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;

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
        quote: quote ? quoteFrom(quote, 200) : null,
      };
    }),
    lengths: rows.lengths.map((row) => [row.bucket, row.entries]),
    words: pickLanguageWords(rows.words.map((row) => [row.word, row.entries])),
    negationEntries: negation ? negation.entries : 0,
    featured: rows.featured[0] ? quoteFrom(rows.featured[0], 420) : null,
    computedAt: computedAt.toISOString(),
  };
}

function refresh(database: DatabaseClient, key: string, cutoff: Date) {
  if (inflight?.key === key) return inflight.promise;
  const startedAt = Date.now();
  const promise = loadSiteStatsRows(database, cutoff)
    .then((rows) => {
      const snapshot = buildSiteStatsSnapshot(rows, cutoff, new Date());
      cached = { key, snapshot };
      lastFailure = null;
      logger.info({
        event: "site_stats.refresh",
        outcome: "succeeded",
        lastDay: snapshot.lastDay,
        totalMs: Date.now() - startedAt,
      });
      return snapshot;
    })
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
    .finally(() => {
      if (inflight?.key === key) inflight = null;
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

export interface SiteStatsView extends SiteStatsSnapshot {
  dailyAverage: number;
}

/**
 * Sayfanın kullandığı görünüm: anlık görüntüdeki alıntı ve başlıklardan şu an yayında
 * olmayanlar çıkarılır (iki küçük sorgu).
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
    ...quotes.map((quote) => quote.topic.publicId),
  ];
  const visible = await findStillPublicIds(database, {
    entryPublicIds: [...new Set(quotes.map((quote) => quote.entryPublicId))],
    topicPublicIds: [...new Set(topicIds)],
  });
  const keepQuote = (quote: SiteStatsQuote | null) =>
    quote && visible.entries.has(quote.entryPublicId) && visible.topics.has(quote.topic.publicId)
      ? quote
      : null;
  return {
    ...snapshot,
    rising: snapshot.rising.filter((topic) => visible.topics.has(topic.publicId)),
    voiced: snapshot.voiced.filter((topic) => visible.topics.has(topic.publicId)),
    authors: snapshot.authors.map((author) => ({ ...author, quote: keepQuote(author.quote) })),
    featured: keepQuote(snapshot.featured),
    dailyAverage: recentDailyAverage(snapshot.days, SITE_STATS_DAILY_WINDOW_DAYS),
  };
}

/** Yalnız testler için: modül düzeyindeki önbelleği sıfırlar. */
export function resetSiteStatsCacheForTests(): void {
  cached = null;
  inflight = null;
  lastFailure = null;
}
