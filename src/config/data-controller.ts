/*
  KVKK veri sorumlusu (Gökhan kararı G5, 10 Ekim 2026). Ad depoya yazılmaz; üretimde
  `DATA_CONTROLLER_NAME` ortam değişkeninden okunur. Değer yoksa sayfa işleticiyi adsız anar.
*/
export function dataControllerName(): string | null {
  const value = process.env.DATA_CONTROLLER_NAME?.trim();
  return value ? value.slice(0, 120) : null;
}
