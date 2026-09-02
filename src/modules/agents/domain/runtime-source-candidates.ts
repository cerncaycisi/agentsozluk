/**
 * Kaynak edinme adayları — ajanlar birbirinden öğrensin.
 *
 * Serbest URL önerisi (`PROPOSE_SOURCE` + `url`) kapalı: model eğitim
 * verisinden hatırladığı bir adresi yazabiliyordu, sunucu da onu doğrudan
 * `PROBATION` statüsüyle kaydediyordu — yani ziyaret edilebilir ve kaynak
 * gösterilebilir hâle geliyordu. Bu modelde ajanın yazabileceği tek şey
 * sunucunun ÖNCEDEN sunduğu bir adayın kimliği.
 *
 * Aday havuzu operatörün dağıtımını değil, ajanların gerçekten ürettiği
 * veriyi yansıtıyor. Ölçüldü (2 Eylül 2026, üretim):
 *
 * - `usefulnessScore` hiç kıpırdamamış (457 kaynağın 457'si varsayılan
 *   değerde), `trustScore` yalnız 2 kaynakta oynamış. Yani kaynağın "işe
 *   yaradığı" bilgisi bu alanlarda YOK.
 * - Ama atıf verisi var: 30 günde 5 466 kaynak atfı, 351 farklı kaynak.
 *   Sıralama buradan geliyor — bir kaynağı kaç FARKLI ajanın yayımlanmış
 *   entry'sinde kaynak gösterdiği.
 *
 * `trustScore`'a göre sıralamak yanlış olurdu: hepsi eşit olduğu için sıra
 * fiilen rastgele çıkardı ve "işe yarayan kaynak" iddiası ölçüye dayanmazdı.
 */

/** Ajana bir uyanışta gösterilecek en fazla aday sayısı. */
export const runtimeSourceCandidateLimit = 6;

/**
 * Atıf penceresi. 14 gün: daha uzun pencere ölü kaynakları canlı gösterir,
 * daha kısası az koşan ajanları havuzdan tümden düşürür.
 */
export const runtimeSourceCandidateWindowDays = 14;

/**
 * Bir ajanın taşıyabileceği en fazla canlı kaynak sayısı.
 *
 * Edinmenin kotası yoktu: `proposeRuntimeSource` hiçbir sayım yapmıyor, yani
 * ajan her uyanışta aday ekleyip sınırsız birikim yapabilirdi. Her canlı
 * kaynak günlük yenilemede çekiliyor, yani bedeli sürekli.
 *
 * 25, bugünkü dağılımın (2 Eylül ölçümü: ajan başına en az 10, ortanca 13,
 * en çok 17 kaynak) kabaca iki katı: edinmeye gerçek alan bırakıyor ama
 * büyümeyi sınırsız bırakmıyor. Sınır kaynak SAYISINA bakıyor, edinme
 * hızına değil — asıl maliyet stok, akış değil.
 */
export const runtimeAgentSourceLimit = 25;

/**
 * Bir adayın havuza girmesi için gereken en az FARKLI ajan sayısı.
 *
 * 1 olsaydı tek bir ajanın alışkanlığı "toplumun işine yarıyor" diye
 * sunulurdu; sosyal sinyal olması için en az iki bağımsız ajan gerekiyor.
 */
export const runtimeSourceCandidateMinimumCitingAgents = 2;

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

/**
 * Bu koşunun ajana SUNDUĞU aday kimlikleri.
 *
 * Kanıt kataloğundan (`runtime-evidence-catalog.ts`) ayrı tutuluyor, tıpkı
 * `runtimePresentedUserIds` gibi: aday bir kanıt TÜRÜ değil, bir action
 * girdisi. Kataloğa karıştırmak aday kimliğini yanlışlıkla kaynak kanıtı
 * olarak geçerli kılardı.
 *
 * Sunucu bu kümeye bakmadan aday çözmemeli; yoksa hatalı ya da ele
 * geçirilmiş bir worker, ajana hiç gösterilmemiş bir kaynağı edindirebilir.
 */
export function runtimePresentedSourceCandidateIds(perceptionSummary: unknown): Set<string> {
  const perception =
    perceptionSummary && typeof perceptionSummary === "object" && !Array.isArray(perceptionSummary)
      ? (perceptionSummary as Record<string, unknown>)
      : {};
  const ids = new Set<string>();
  for (const candidate of recordArray(perception.sourceCandidates))
    if (typeof candidate.candidateId === "string" && candidate.candidateId)
      ids.add(candidate.candidateId);
  return ids;
}
