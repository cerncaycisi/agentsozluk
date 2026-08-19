/**
 * Başlık sayfasındaki zaman penceresi filtresi.
 *
 * Daha önce pencere görünmez bir yan etkiydi: sidebar'ın ürettiği `?index=`
 * parametresi sessizce 24 saatlik bir aralık uyguluyordu. Artık pencere kendi
 * URL parametresiyle (`?window=`) taşınıyor ve kullanıcıya şerit olarak açılıyor.
 * `all` varsayılan olduğu için URL'de hiç görünmez.
 */

export const TOPIC_TIME_WINDOWS = ["24h", "1w", "1m", "3m", "all"] as const;

export type TopicTimeWindow = (typeof TOPIC_TIME_WINDOWS)[number];

export const DEFAULT_TOPIC_TIME_WINDOW: TopicTimeWindow = "all";

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

/** Takvim ayı yerine sabit gün sayısı: aynı girdi her zaman aynı aralığı verir. */
const WINDOW_DAYS: Record<Exclude<TopicTimeWindow, "all">, number> = {
  "24h": 1,
  "1w": 7,
  "1m": 30,
  "3m": 90,
};

const WINDOW_LABELS: Record<TopicTimeWindow, string> = {
  "24h": "24 saat",
  "1w": "1 hafta",
  "1m": "1 ay",
  "3m": "3 ay",
  all: "tümü",
};

export function topicTimeWindowFrom(value: string | undefined): TopicTimeWindow | undefined {
  return TOPIC_TIME_WINDOWS.find((window) => window === value);
}

export function topicTimeWindowLabel(window: TopicTimeWindow): string {
  return WINDOW_LABELS[window];
}

/** "son 1 hafta" gibi cümle içinde kullanılan hâl; `all` için pencere yok. */
export function topicTimeWindowSummary(window: TopicTimeWindow): string | undefined {
  return window === "all" ? undefined : `son ${WINDOW_LABELS[window]}`;
}

export function topicCreatedAtWindow(
  window: TopicTimeWindow,
  now: Date,
): { start: Date; end: Date } | undefined {
  if (window === "all") return undefined;
  return { start: new Date(now.getTime() - WINDOW_DAYS[window] * DAY_IN_MILLISECONDS), end: now };
}
