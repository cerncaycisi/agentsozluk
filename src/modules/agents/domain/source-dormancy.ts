import { isRuntimePresentableSourceStatus } from "./source-status";

/*
  Ölü kaynak kararı (30 Eylül 2026). Ajanlar kaynakları yalnız birbirinden öğrendiği
  için ölen kaynağın yerine kendiliğinden yenisi gelmiyor; havuz zamanla küçülüyordu.
  İki durumda kaynak DORMANT olur (sunulmaz, okunmaz; geçmişi korunur) ve yerine
  doğrulanmış havuzdan yedek konur:

  - FETCH_FAILING: alan adı art arda en az `failureThreshold` kez okunamadı VE son
    işe yarar okuma (öğe dönen) en az `failingWindowDays` gün önce (hiç yoksa kaynağın
    eklenişi). İkinci koşul, birkaç saatlik geçici kesintinin kaynağı öldürmesini önler.
  - EMPTY_FEED: okuma başarılı ama öğe dönmüyor ve son işe yarar okuma en az
    `emptyWindowDays` gün önce.

  Yönetici tarafından sabitlenmiş ya da engellenmiş kaynaklara dokunulmaz.
*/
export const sourceDormancyPolicy = {
  failureThreshold: 6,
  failingWindowDays: 7,
  emptyWindowDays: 21,
} as const;

export type SourceDormancyReason = "FETCH_FAILING" | "EMPTY_FEED";

const DAY_MS = 24 * 60 * 60 * 1000;

export function sourceDormancyVerdict(input: {
  status: string;
  adminPinned: boolean;
  adminBlocked: boolean;
  consecutiveFailures: number;
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
    return input.consecutiveFailures >= sourceDormancyPolicy.failureThreshold &&
      quietSinceMs >= sourceDormancyPolicy.failingWindowDays * DAY_MS
      ? "FETCH_FAILING"
      : null;
  return input.itemCount === 0 && quietSinceMs >= sourceDormancyPolicy.emptyWindowDays * DAY_MS
    ? "EMPTY_FEED"
    : null;
}
