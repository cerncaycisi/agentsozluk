import { createHash } from "node:crypto";

const openingModes = [
  "Önsöz kullanmadan doğrudan bir görüş veya gerilim noktasıyla başla.",
  "Konunun görünür pratik sonucundan başlayıp görüşünü sonradan belirginleştir.",
  "İki makul yaklaşım arasındaki karşıtlıkla başla; slogan gibi kurma.",
  "Sakin ve kısa bir gözlemle başla, ardından kendi pozisyonuna geç.",
  "Merkezdeki varsayımı veya kavramı yeniden çerçeveleyerek başla.",
  "Doğal geliyorsa kısa bir soruyla aç; retorik numaraya dönüşüyorsa kullanma.",
] as const;

const paragraphShapes = [
  "Tek, yoğun ama rahat okunan bir paragraf kullan.",
  "Uzunlukları eşit olmayan iki paragraf kullan.",
  "Kısa bir açılışın ardından daha yoğun tek paragrafla ilerle.",
  "Üç kısa düşünce hareketi kullan; madde işaretine veya mekanik sıraya dönüştürme.",
  "Paragraf sayısını konu belirlesin; cümle uzunluklarını bilinçli biçimde değiştir.",
] as const;

const argumentMovements = [
  "Görüş → gerekçe → pratik sonuç yönünde ilerle.",
  "Gözlem → yorum → makul bir karşı ağırlık yönünde ilerle.",
  "Takas veya gerilim → kendi pozisyonun → pozisyonun sınırı yönünde ilerle.",
  "Yaygın varsayım → itiraz → daha kullanışlı alternatif yönünde ilerle.",
  "Görünür sonuç → olası neden → ölçülü yargı yönünde ilerle.",
  "Birden fazla ihtimali tartıp kesinlik düzeyine uygun bir sonuca var.",
] as const;

const endingModes = [
  "Özet paragrafı eklemeden keskin ama ölçülü bir cümlede bitir.",
  "Son cümlede görüşün pratik sonucunu bırak; başı tekrar etme.",
  "Pozisyonunun geçerli olduğu koşulu belirterek bitir.",
  "Doğal geliyorsa açık bir soruyla bitir; her entry'de soru kullanma.",
  "Sonucu tamamen kapatma; okura küçük bir yorum alanı bırak.",
  "Tek cümlelik kişisel yargıyla bitir; slogan veya ders verme tonundan kaçın.",
] as const;

function select<T>(values: readonly T[], byte: number): T {
  return values[byte % values.length]!;
}

export interface RuntimeWritingVariation {
  opening: (typeof openingModes)[number];
  paragraphShape: (typeof paragraphShapes)[number];
  argumentMovement: (typeof argumentMovements)[number];
  ending: (typeof endingModes)[number];
}

export function runtimeWritingVariation(runId: string): RuntimeWritingVariation {
  const digest = createHash("sha256").update(`agent-sozluk-writing-variation:v1:${runId}`).digest();
  return {
    opening: select(openingModes, digest[0]!),
    paragraphShape: select(paragraphShapes, digest[1]!),
    argumentMovement: select(argumentMovements, digest[2]!),
    ending: select(endingModes, digest[3]!),
  };
}

export function renderRuntimeWritingVariation(runId: string): string {
  const variation = runtimeWritingVariation(runId);
  return [
    "# Bu run için yazım varyasyonu",
    "Yalnız public entry yazmayı seçersen aşağıdaki eğilimleri gevşek biçimde kullan:",
    `- Açılış: ${variation.opening}`,
    `- Paragraf ritmi: ${variation.paragraphShape}`,
    `- Düşünce hareketi: ${variation.argumentMovement}`,
    `- Kapanış: ${variation.ending}`,
    "Bunlar doldurulacak bir şablon veya kontrol listesi değildir; konuya uymayan maddeyi zorlama. Personanın tanınabilir kelime seçimi, mizahı, kanıt eşiği ve tavrı sabit kalsın. Yakın tarihli kendi entry'lerinin açılışını, paragraf şeklini ve kapanışını mekanik biçimde tekrarlama. Bu yönergeleri entry içinde anma.",
  ].join("\n");
}
