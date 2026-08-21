import { createHash } from "node:crypto";

export type PersonaEntryLength = "SHORT" | "MEDIUM" | "LONG" | "MIXED";
export type RuntimeEntryForm = "MICRO" | "SHORT" | "MEDIUM" | "LONG";
/*
  Sürüm 6: soru izni geri getirildi.

  27 Temmuz'daki `4d78e96` ("Calibrate dictionary-native writing") `openingModes`
  dizisini bütünüyle kaldırdı ve `endingModes`'u baştan yazdı. Silinen listede
  sistemdeki TEK soru üreticisi iki satır duruyordu. Niyet münazara iskeletini
  atmaktı — ATTEMPT_LOG'da öyle yazıyor — soru yanlışlıkla onunla gitti.

  Ölçüldü. Canlı günlük kırılım:
    23 Tem %27,8   ← anayasa yürürlüğe girdiği gün, düşüş YOK
    26 Tem  %8,3
    27 Tem  %4,3   ← bu commit, 15:37
    28 Tem  %0,18
  Yani sebep anayasa değil, bu dosya. 200 bin run simülasyonu da uyuyor: v1'de
  açık soru izni %30,3 iken ölçülen oran %9,7 (model izni kabaca üçte bir oranında
  kullanıyor), v3'te izin %0 iken ölçülen %0.

  17 Ağustos'ta `openingModes` geri geldi ama soru maddesi üç kez zayıflatılmıştı:
  soru ikinci alternatifti ("itiraz veya soru"), koşul "doğal geliyorsa"dan
  "yaygın bir kabule"ye daralmıştı ve aynı cümlede iki soru-yasağı vardı.

  Şimdi: açılışta soru kendi maddesi, v1'in koşuluyla. Kapanıştaki "Soru, çağrı,
  ders..." yasağından yalnız "Soru" çıkarıldı — çağrı ve tartışma daveti yasağı
  duruyor, çünkü anayasa forum çağrısını gerçekten yasaklıyor. Gövdedeki soruyu
  ise açıkça legal sayıyor (Madde 30-31 BAŞLIK hakkındadır).

  Liste boyları korunuyor: madde eklenmedi, yerinde değiştirildi.
*/
export const RUNTIME_WRITING_VARIATION_VERSION = 6;

const formDistributions: Record<PersonaEntryLength, readonly RuntimeEntryForm[]> = {
  SHORT: ["MICRO", "MICRO", "MICRO", "SHORT", "SHORT", "SHORT", "MEDIUM", "LONG"],
  MEDIUM: ["MICRO", "MICRO", "SHORT", "SHORT", "SHORT", "MEDIUM", "MEDIUM", "LONG"],
  LONG: ["MICRO", "SHORT", "SHORT", "MEDIUM", "MEDIUM", "MEDIUM", "LONG", "LONG"],
  MIXED: ["MICRO", "MICRO", "SHORT", "SHORT", "SHORT", "MEDIUM", "MEDIUM", "LONG"],
} as const;

const formInstructions: Record<RuntimeEntryForm, string> = {
  MICRO:
    "Mikro form eğilimi: çoğu zaman 1-10 kelimelik tek doğal cümle veya tek başına işlev taşıyan kısa bir bkz yeterlidir.",
  SHORT: "Kısa form eğilimi: çoğu zaman 11-30 kelime ve bir ila üç doğal cümle yeterlidir.",
  MEDIUM:
    "Orta form eğilimi: çoğu zaman 31-100 kelime içinde yalnız gereken ayrıntıyı taşı; tek paragraf da iki dengesiz paragraf da normaldir.",
  LONG: "Uzun form erişilebilir: konu gerçekten taşıyorsa 100 kelimeyi aşabilirsin; taşımıyorsa seçilen forma rağmen kısa bitirmek serbesttir.",
} as const;

const entryFunctions = [
  "Tanım: başlığın ne olduğunu yalın biçimde söyle; sözlük maddesi gibi görünmek için gereksiz resmiyet ekleme.",
  "Gözlem: başlığa ait ayırt edici ve tek başına anlaşılır bir özelliği gündelik dille kaydet.",
  "Örnek: başlığın neye benzediğini veya nerede karşımıza çıktığını tek başına anlaşılır bir örnekle göster.",
  "Yorum: öznel ama başlığa doğrudan bağlı bir değerlendirme yap; bunu genel gerçek gibi sunma.",
  "Kavramsal bağlantı: gerçekten açıklayıcı bir ilişki varsa gizli [[başlık]] veya görünür (bkz: başlık) kullan; hedef henüz açılmamış olabilir, sırf link üretmek için ekleme.",
  "Kaynaklı güncelleme: güncel kişi, olay, eser, ürün veya kurum için önce adresin ne olduğunu anlat, sonra yalnız kanıtın taşıdığı ayrıntıyı ekle.",
] as const;

const registerModes = [
  "Düz ve gündelik yaz; akademik özet tonuna çıkma.",
  "Kısa ve kuru yaz; açıklama borcu yoksa cümleyi büyütme.",
  "Doğal bir sohbet rahatlığı kullan ama okura seslenme ve forum cevabına dönüşme.",
  "Personaya uyuyorsa hafif mizah kullan; espriyi tanımın yerine koyma.",
  "Teknik terim gerekiyorsa kullan, ardından makale özeti kurmadan anlamını açık tut.",
  "Ölçülü ve kişisel bir ton kullan; uydurma offline deneyim anlatma.",
] as const;

const openingModes = [
  "Doğrudan tanım gerekiyorsa başlığı yeniden söylemeden yalın bir tanımla gir; '-dır/-dir' kalıbını otomatik başlangıç sayma.",
  "Başlığa ait somut ve ayırt edici bir gözlemle gir; ne olduğunu sonraki cümle zaten açıklayabiliyorsa başlığı tekrar etme.",
  "Kısa, gündelik ve tek başına anlaşılır bir örnekle gir; örneği ardından başlığa bağla.",
  "Ölçülü kişisel görüşü ilk cümlede açıkça söyle; öznel yargıyı genel gerçek gibi sunma.",
  "Anlamı gerçekten değiştiriyorsa kısa bir çekince veya istisnayla gir; yapay belirsizlik üretme.",
  "İki görünüm arasındaki ayırt edici farkla gir; giriş bölümünü münazaraya dönüştürme.",
  "Doğal geliyorsa kavrama yönelmiş kısa bir soruyla gir; okurdan cevap isteme, retorik numaraya çevirme.",
  "Başlığa doğrudan bağlı kısa bir iddiayla gir; gerekçeyi gerekiyorsa ardından ver, sonuç cümlesini başa kopyalama.",
] as const;

const paragraphShapes = [
  "Tek rahat paragraf yeterli olsun.",
  "İki paragraf gerekiyorsa uzunluklarını eşitleme; ikinci paragraf yeni bir sözlük işlevi taşısın.",
  "Kısa bir tanımın ardından yalnız ayırt edici ayrıntıyı ekle.",
  "Bir örnek ile kısa yorum arasında doğal bir geçiş kur.",
  "Paragraf sayısını konu belirlesin; doldurmak için bölüm ekleme.",
] as const;

const developmentModes = [
  "Tanım → ayırt edici ayrıntı yönünde ilerle.",
  "Somut örnek → örneğin başlık için ne gösterdiği yönünde ilerle.",
  "Gözlenebilir özellik → gündelik sonuç yönünde ilerle.",
  "Kullanım veya köken → bugünkü anlam yönünde ilerle.",
  "İki görünümü kısa karşılaştır; münazara veya karşı görüş bölümü kurma.",
  "Kaynaklı olgu → sınırları açık kısa yorum yönünde ilerle.",
] as const;

const endingModes = [
  "Söylenecek şey bittiyse sonuç cümlesi eklemeden dur.",
  "Tek cümlelik ölçülü bir kişisel yargıyla bitir.",
  "Gerçekten yardımcıysa ilişkili kavrama tek bir gizli [[başlık]] veya görünür (bkz: başlık) ile bitir.",
  "Belirsizlik veya istisna anlamı değiştiriyorsa onu kısa son ayrıntı yap.",
  "Başlığı akılda tutan somut bir ayrıntıyla bitir; başı özetleme.",
  "Çağrı, ders veya tartışma daveti eklemeden bitir.",
] as const;

function select<T>(values: readonly T[], byte: number): T {
  return values[byte % values.length]!;
}

export interface RuntimeWritingVariation {
  form: RuntimeEntryForm;
  entryFunction: (typeof entryFunctions)[number];
  register: (typeof registerModes)[number];
  opening: (typeof openingModes)[number];
  paragraphShape: (typeof paragraphShapes)[number];
  development: (typeof developmentModes)[number];
  ending: (typeof endingModes)[number];
}

export function runtimeWritingVariation(
  runId: string,
  personaEntryLength: PersonaEntryLength = "MIXED",
): RuntimeWritingVariation {
  const digest = createHash("sha256")
    .update(`agent-sozluk-writing-variation:v${RUNTIME_WRITING_VARIATION_VERSION}:${runId}`)
    .digest();
  return {
    form: select(formDistributions[personaEntryLength], digest[4]!),
    entryFunction: select(entryFunctions, digest[0]!),
    register: select(registerModes, digest[5]!),
    opening: select(openingModes, digest[6]!),
    paragraphShape: select(paragraphShapes, digest[1]!),
    development: select(developmentModes, digest[2]!),
    ending: select(endingModes, digest[3]!),
  };
}

export function renderRuntimeWritingVariation(
  runId: string,
  personaEntryLength: PersonaEntryLength = "MIXED",
): string {
  const variation = runtimeWritingVariation(runId, personaEntryLength);
  const expandedDimensions =
    variation.form === "MICRO" || variation.form === "SHORT"
      ? [`- Sözlük işlevi: ${variation.entryFunction}`, `- Ton: ${variation.register}`]
      : variation.form === "MEDIUM"
        ? [
            `- Sözlük işlevi: ${variation.entryFunction}`,
            `- Ton: ${variation.register}`,
            `- Paragraf ritmi: ${variation.paragraphShape}`,
          ]
        : [
            `- Sözlük işlevi: ${variation.entryFunction}`,
            `- Ton: ${variation.register}`,
            `- Paragraf ritmi: ${variation.paragraphShape}`,
            `- Gelişim: ${variation.development}`,
            `- Bitiş: ${variation.ending}`,
          ];
  return [
    "# Bu run için yazım varyasyonu",
    "Yalnız public entry yazmayı seçersen aşağıdaki eğilimleri gevşek biçimde kullan:",
    `- Form: ${formInstructions[variation.form]}`,
    `- Açılış: ${variation.opening}`,
    ...expandedDimensions,
    "Kısa/orta/uzun dağılımı gözlemsel kalibrasyondur, kota değildir. Bunlar doldurulacak bir şablon veya kontrol listesi değildir; konuya uymayan maddeyi zorlama. Her entry tek başına okunabilir bir sözlük işlevi taşısın. Personanın tanınabilir kelime seçimi, mizahı, kanıt eşiği ve tavrı sabit kalsın. Yakın tarihli kendi entry'lerinin işlevini, açılışını ve paragraf şeklini mekanik biçimde tekrarlama. Bu yönergeleri entry içinde anma.",
  ].join("\n");
}
