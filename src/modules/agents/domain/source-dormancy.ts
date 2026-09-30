import { isRuntimePresentableSourceStatus } from "./source-status";

/*
  Ölü kaynak kararı (30 Eylül 2026). Ajanlar kaynakları yalnız birbirinden öğrendiği
  için ölen kaynağın yerine kendiliğinden yenisi gelmiyor; havuz zamanla küçülüyordu.
  İki durumda kaynak DORMANT olur (sunulmaz, okunmaz; geçmişi korunur) ve yerine
  doğrulanmış havuzdan yedek konur:

  - FETCH_FAILING: KAYNAĞIN KENDİ son `failureThreshold` okuma sonucu (bu dahil) hata
    VE son işe yarar okuma (öğe dönen) en az `failingWindowDays` gün önce (hiç yoksa
    kaynağın eklenişi). Alan adı düzeyindeki backoff sayacı kullanılmaz: aynı alan adındaki
    başka kaynağın hataları bu kaynağı öldürmemeli, başarısı da ölümünü engellememeli
    (Astra 888f869, cfb1985). İkinci koşul, geçici kesintinin kaynağı öldürmesini önler.
  - EMPTY_FEED: okuma başarılı ama öğe dönmüyor ve son işe yarar okuma en az
    `emptyWindowDays` gün önce.

  Yönetici tarafından sabitlenmiş ya da engellenmiş kaynaklara dokunulmaz.
*/
export const sourceDormancyPolicy = {
  failureThreshold: 6,
  failingWindowDays: 7,
  emptyWindowDays: 21,
  /** Kaynak sonuç kanıtı (olay kaydı) en fazla bu kadar geriye taranır. */
  evidenceWindowDays: 30,
  /** Son bu kadar gün içinde herhangi bir ajanda işe yarayan URL sağlıklı sayılır. */
  healthyUsefulWindowDays: 7,
} as const;

export type SourceDormancyReason = "FETCH_FAILING" | "EMPTY_FEED";

const DAY_MS = 24 * 60 * 60 * 1000;

export function sourceDormancyVerdict(input: {
  status: string;
  adminPinned: boolean;
  adminBlocked: boolean;
  /** Bu kaynağın bu sonuçtan ÖNCEKİ en son sonuçlarından art arda kaç tanesi hata. */
  priorConsecutiveSourceFailures: number;
  lastUsefulAt: Date | null;
  createdAt: Date;
  fetchFailed: boolean;
  itemCount: number;
  now: Date;
}): SourceDormancyReason | null {
  if (input.adminPinned || input.adminBlocked || !isRuntimePresentableSourceStatus(input.status))
    return null;
  const quietSinceMs = input.now.getTime() - (input.lastUsefulAt ?? input.createdAt).getTime();
  if (input.fetchFailed)
    return input.priorConsecutiveSourceFailures + 1 >= sourceDormancyPolicy.failureThreshold &&
      quietSinceMs >= sourceDormancyPolicy.failingWindowDays * DAY_MS
      ? "FETCH_FAILING"
      : null;
  return input.itemCount === 0 && quietSinceMs >= sourceDormancyPolicy.emptyWindowDays * DAY_MS
    ? "EMPTY_FEED"
    : null;
}

/*
  Okuma sonucunun sınıfı (Astra 7487234 P2). Worker başarıyla okunan ama ajana uygun öğe
  vermeyen beslemeyi `SOURCE_NO_USEFUL_ITEMS` hata koduyla, koşu süresi dolduğu için
  yarıda kesilen okumayı `SOURCE_CANCELLED` ile bildiriyor. İlki boş besleme (21 günlük
  kural), ikincisi kaynağın kusuru değil (nötr); ikisi de okuma hatası sayılmaz.
*/
export type SourceResultKind = "SUCCESS" | "EMPTY" | "FAILED" | "NEUTRAL";

export function sourceResultKind(input: {
  errorCode: string | null | undefined;
  itemCount: number;
}): SourceResultKind {
  if (!input.errorCode) return input.itemCount > 0 ? "SUCCESS" : "EMPTY";
  if (input.errorCode === "SOURCE_NO_USEFUL_ITEMS") return "EMPTY";
  if (input.errorCode === "SOURCE_CANCELLED") return "NEUTRAL";
  return "FAILED";
}
