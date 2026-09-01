/**
 * Gezinme fazı 50/50 deneyi.
 *
 * Faz canlıya çıktıktan sonra ölçülen zarar: entry/saat %39 düştü,
 * `CODEX_TIMEOUT` %13,6'dan %21,6'ya çıktı (bkz
 * `docs/GEZINME_FAZI_OLCUMU_2026-08-28.md`). Fazın kendi çürütme koşullarından
 * biri buydu: "koşu süreleri deadline'a dayanırsa faz geri alınmalı".
 *
 * Sebep tasarımdaydı: gezinme çağrısı koşunun KALAN BÜTÜN bütçesini timeout
 * olarak alıyordu. Gezinme takıldığında karar çağrısına bütçe kalmıyor ve koşu
 * hiçbir şey üretmeden düşüyordu — yani fazın maliyeti sınırsızdı.
 *
 * Deney (Sol'un tasarımı): koşular runId'den türeyen SABİT bir hash'le ikiye
 * bölünür.
 * - `CONTROL`: gezinme yok, faz öncesi davranış.
 * - `BROWSE`: gezinme var ama kendi `runtimeBrowseTimeoutMs` tavanıyla; toplam
 *   deadline değişmez, yani gezinme artık karar çağrısını aç bırakamaz.
 *
 * Kol hem runId'den deterministik türüyor HEM DE koşuyla birlikte kalıcı
 * yazılıyor (`usageMetadata.browseExperiment`). Yalnız yeniden hesaplamaya
 * güvenmek yanlıştı (Sol hakem turu): hash ya da kod değişirse geçmiş kollar
 * sessizce yeniden tanımlanır, ve daha önemlisi ATANAN kol ile GERÇEKTEN
 * UYGULANAN tedavi ayırt edilemez. Gezinme bütçe yokluğundan atlandığında ya
 * da timeout'a düştüğünde koşu BROWSE kolunda "tedavi almamış" sayılmalı ama
 * intention-to-treat analizinde yine BROWSE olarak kalmalı — bu ancak
 * `arm`, `attempted` ve `outcome` birlikte saklanırsa mümkün.
 */

/**
 * Gezinme çağrısının kendi tavanı. Ölçülen ortalama 11 sn (28 Ağustos, n=6).
 *
 * Bu bir DUVAR SAATİ garantisi değil: sağlayıcı timeout'tan sonra süreci
 * SIGTERM→SIGKILL ile kapatırken ek pay harcıyor (`codex-cli-provider.ts`).
 * "En fazla 20 sn zarar" demek yanlış olur; gerçek üst sınır biraz daha
 * yüksek (Sol hakem turu).
 */
export const runtimeBrowseTimeoutMs = 20_000;

/**
 * Karar çağrısına ayrılan dokunulmaz bütçe.
 *
 * Ölçüldü (1 Eylül 2026, üretim, 7 gün, n=1948 başarılı koşu): karar çağrısı
 * (onarım turu dahil) p50 268 sn, p95 440 sn, p99 464 sn. `NORMAL_WAKE` koşu
 * bütçesi 480 sn, başarılı koşuların p95'i 453 sn, `CODEX_TIMEOUT` koşuları tam
 * 480 sn'de ölüyor. Yani sistem zaten tavanına dayanmış.
 *
 * `min(kalan, 20 sn)` tek başına YETMEZ: kalan 12 sn olduğunda gezinme yine
 * hepsini alır ve karar aç kalır (Sol hakem turu, doğru bulgu).
 *
 * SOL'DAN BİLİNÇLİ SAPMA. Sol rezervin karar p95'inden (440 sn) türemesini
 * söyledi. Onu birebir uygularsam 480 sn'lik bütçede gezinmeye pay kalmıyor:
 * BROWSE kolu her koşuda `NO_BUDGET` ile atlanır, CONTROL koluna dönüşür ve
 * deney hiçbir şey ölçmez. Rezerv bunun yerine p50'nin (268 sn) üstünde
 * güvenli bir tabana kuruldu: gezinme ancak karara en az bu kadar süre
 * kalıyorsa denenir, ve her hâlükârda 20 sn'yi geçemez.
 *
 * Yani tavan zararı sınırlar, rezerv patolojik hâli (kalan süre erimişken
 * gezinmeye girmek) engeller. Kalan risk deneyin ta kendisi: karar süresi
 * 460-480 sn bandındaki koşuları gezinme tavanı sınırın üstüne itebilir —
 * ölçülecek olan budur.
 */
export const runtimeDecisionReserveMs = 300_000;

/**
 * Gezinmeye verilebilecek bütçe; sıfır ya da altıysa gezinme hiç denenmemeli.
 * Karar rezervi her zaman korunur.
 */
export function runtimeBrowseBudgetMs(remainingMs: number): number {
  return Math.min(runtimeBrowseTimeoutMs, remainingMs - runtimeDecisionReserveMs);
}

export type RuntimeBrowseArm = "CONTROL" | "BROWSE";

/**
 * FNV-1a: kısa, bağımlılıksız ve deterministik. Kripto amacı yok — tek istenen
 * runId'ler arasında dengeli ve tekrarlanabilir bir bölme.
 */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Deney KAPALI doğuyor.
 *
 * Bu dosyadaki bütçe tavanı, karar rezervi ve telemetri kaliteyi/güvenilirliği
 * iyileştiriyor ve tek başına gönderilebilir. 50/50 bölme ise davranışı
 * değiştiriyor (koşuların yarısında gezinme kapanıyor) ve hakem turunda hâlâ
 * açık tasarım soruları var (rezerv değeri, koşu bütçesi, kalibrasyon).
 * Bayrak açılana dek uygun her koşu bugünkü gibi gezinir; kol yine kayda
 * geçer, böylece deney açılmadan önce de taban ölçülebilir.
 */
export function runtimeBrowseExperimentEnabled(): boolean {
  return process.env.AGENT_BROWSE_EXPERIMENT === "1";
}

/** Bayraktan bağımsız ham atama; ölçüm ve test kolu sabitlemek için. */
export function runtimeBrowseArmAssignment(runId: string): RuntimeBrowseArm {
  return fnv1a(runId) % 2 === 0 ? "CONTROL" : "BROWSE";
}

export function runtimeBrowseArm(runId: string): RuntimeBrowseArm {
  return runtimeBrowseExperimentEnabled() ? runtimeBrowseArmAssignment(runId) : "BROWSE";
}

/** Koşuyla birlikte kalıcı yazılan deney kaydı. */
export interface RuntimeBrowseExperimentTelemetry {
  version: number;
  arm: RuntimeBrowseArm;
  eligible: boolean;
  attempted: boolean;
  outcome:
    | "NOT_ELIGIBLE"
    | "CONTROL"
    | "NO_MENU"
    | "NO_BUDGET"
    | "SELECTED"
    | "APPLIED"
    | "EMPTY_SELECTION"
    | "TIMEOUT"
    | "INVALID_OUTPUT"
    | "ERROR";
  budgetMs: number;
  durationMs?: number;
  remainingBeforeMs: number;
  menuCount?: number;
  selectedCount?: number;
  readTopicCount?: number;
  runBudgetMs?: number;
  decisionReserveMs?: number;
}
