/**
 * Geleneksel "(bkz: …)" yönlendirmesinin deseni. Sitedeki çözümleyici (renderer.ts) ile ajan üslup
 * denetimi (agents/domain/action-policy.ts) aynı sınırları kullansın diye tek yerde durur; bağımlılığı
 * yoktur, ajan çalıştırıcısına da girer.
 */
export const traditionalBkzSource = String.raw`\(bkz:\s*([^\)\n]{1,100}?)\s*\)`;
