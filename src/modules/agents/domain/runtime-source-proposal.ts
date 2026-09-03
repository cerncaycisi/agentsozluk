/**
 * `PROPOSE_SOURCE` ayrı bir anahtarın arkasında.
 *
 * Bu action zincirin en riskli halkası: model SERBEST BİR URL üretiyor, sunucu
 * onu kaydediyor ve sonraki koşuda o adrese gerçek bir GET atılıyor. Güvenlik
 * planı bunun için `candidate_id` modelini şart koşuyor — model keyfi URL
 * üretemesin, sunucu önceden doğrulanmış bir adayı çözsün — ve "kaynak
 * özellikleri bu yapılmadan yeniden açılmamalı" diyordu.
 *
 * Ölçüldü (2 Eylül 2026, üretim): önkoşul HİÇ uygulanmamış.
 * `sourceEvolutionEnabled` global olarak ve 36 ajanın hepsinde `true`; yani yol
 * açıktı. Bugüne dek 0 `PROPOSE_SOURCE` üretilmiş olması bir kontrol değil,
 * modelin o eylemi seçmemiş olması.
 *
 * `sourceEvolutionEnabled`'ı kapatmak yanlış cevap olurdu: aynı bayrak günlük
 * kaynak yenilemeyi (`DAILY_SOURCE_REFRESH`) ve reflection'daki kaynak güven
 * güncellemelerini de kapatıyor. İkisi de değerli ve serbest-URL riski
 * taşımıyor. Bu yüzden riskli yol kendi anahtarına alındı.
 *
 * Varsayılan KAPALI. Ölçülen maliyet sıfır: bugüne dek hiç kullanılmamış.
 *
 * GÜNCELLEME (2 Eylül 2026): `candidate_id` modeli geldi ama bu bayrak
 * KALDIRILMADI, kapalı bırakıldı. Sebep: aday modeli serbest URL'i gereksiz
 * kılıyor, yerine geçmiyor. Ajanın kaynak edinmesi için meşru bir yol artık
 * var (`sourceCandidates` → `PROPOSE_SOURCE` + `candidateId`), o yüzden
 * serbest URL'i açmanın hiçbir kazancı kalmadı — yalnız riski var. Bayrak,
 * ileride gerçekten gerekirse diye duruyor.
 */
export function runtimeSourceProposalEnabled(): boolean {
  return process.env.AGENT_SOURCE_PROPOSAL === "1";
}
