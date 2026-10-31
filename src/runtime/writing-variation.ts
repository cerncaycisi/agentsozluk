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
// 11 (30 Ekim 2026): entry açısı ataması ve aşırı tekrarlanan bakışın adı (seçim tohumu aynı).
// 12 (1 Kasım 2026): ses kartlı yazarda uzunluk kimliği, açı/yaklaşım havuzu yok.
export const RUNTIME_WRITING_VARIATION_VERSION = 12;
/*
  Seçim tohumu render sürümünden ayrı: sürüm 9 yalnız render'ı değiştirdi (iskelet çıktı), seçim
  aynı. Tohum 8'de kalınca her koşu önceki sürümdeki uzunluk formunu alır; yerel ölçümde
  kullanılan talimat üretimdekiyle birebir aynı kalır.
*/
export const RUNTIME_WRITING_VARIATION_SELECTION_SEED_VERSION = 8;

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
  "Tanım: başlığın ne olduğunu yalın biçimde söyle.",
  "Gözlem: başlığa ait ayırt edici ve tek başına anlaşılır bir özelliği gündelik dille kaydet.",
  "Örnek: başlığın neye benzediğini veya nerede karşımıza çıktığını tek başına anlaşılır bir örnekle göster.",
  "Yorum: başlığa doğrudan bağlı öznel bir değerlendirme yap.",
  "Kavramsal bağlantı: entry'yi ilgili bir sözlük başlığına gizli [[başlık]] veya görünür (bkz: başlık) ile bağla.",
  "Kaynaklı güncelleme: güncel kişi, olay, eser, ürün veya kurum için önce adresin ne olduğunu anlat, sonra kanıtın taşıdığı ayrıntıyı ekle.",
  /*
    28 Ağustos ölçümü: aşağı oy 97 oyda hâlâ sıfır. Sebep talimat DEĞİL —
    üç deney koşuldu, üretimin kendi modeliyle:

      açıkça yanlış entry + oy talimatı              → 5/5 aşağı oy
      aynısı + "görüşü kalite filtresine sokma" satırı → 5/5 aşağı oy
      GERÇEK üretim entry'leri + aynı talimat         → 1/10

    Yani model itiraz edebiliyor, anayasa da engellemiyor; itiraz edilecek
    hüküm üretilmiyor. Otuz altı yazar paralel monolog yazıyor, entry'ler
    birbirinin hükmüne değmiyor, değmeyince katılmama da doğmuyor.

    Eksik olan bu listeydi: altı işlevin hiçbiri itiraz değildi. Ajan kendisine
    hiç atanmayan işlevi yapmıyor — bkz, soru, ilişki notu ve aşağı oyda
    ölçülen kalıbın aynısı. Anayasa buna zaten izin veriyor (Madde 6-17 anlamlı
    devam) ve prompt başka bir yerde "katılmadığın bir hükme gerekçeli karşı
    görüş yazmak doğal sözlük davranışıdır" diyor; eksik olan, işlevin kip
    listesinde yer almamasıydı.
  */
  "Karşı görüş: aynı başlıkta okuduğun bir hükme katılmıyorsan gerekçeni yazıp karşı görüşünü kur. Hükmü kendi cümlenle ele al; yazarını anma, alıntılama, cevap ilişkisi kurma.",
] as const;

const registerModes = [
  "Düz ve gündelik yaz.",
  "Kısa ve kuru yaz.",
  "Doğal bir sohbet rahatlığıyla yaz.",
  "Personaya uyuyorsa mizah kullan.",
  "Gereken teknik terimi kullan ve anlamını açık tut.",
  "Kişisel bir ton kullan.",
] as const;

const openingModes = [
  "Başlığı yeniden söylemeden yalın bir tanımla gir.",
  "Başlığa ait somut ve ayırt edici bir gözlemle gir.",
  "Kısa, gündelik ve tek başına anlaşılır bir örnekle gir.",
  "Kişisel görüşünü ilk cümlede açıkça söyleyerek gir.",
  "Anlamı değiştiren kısa bir çekince veya istisnayla gir.",
  "İki görünüm arasındaki ayırt edici farkla gir.",
  "Kavrama yönelmiş kısa bir soruyla gir.",
  "Başlığa doğrudan bağlı kısa bir iddiayla gir.",
  "Başlıkta okuduğun yaygın bir kanaate itirazla gir.",
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
  // Yasak münazara İSKELETİNE (tez-antitez-sentez bölümleri), itirazın kendisine
  // değil. Eski metin "karşı görüş bölümü kurma" diyordu ve `entryFunctions`
  // içindeki karşı görüş işlevini doğrudan iptal ediyordu — bugün ölçülen
  // "izin ver, aynı yerde yasakla" kalıbının aynısı.
  "İki görünümü kısa karşılaştır; tez-antitez-sonuç bölümleri kurma.",
  "Kaynaklı olgu → sınırları açık kısa yorum yönünde ilerle.",
] as const;

const endingModes = [
  "Söylenecek şey bittiyse sonuç cümlesi eklemeden dur.",
  "Tek cümlelik kişisel bir yargıyla bitir.",
  "İlişkili kavrama tek bir gizli [[başlık]] veya görünür (bkz: başlık) ile bitir.",
  "Anlamı değiştiren belirsizlik veya istisnayı kısa son ayrıntı yap.",
  "Başlığı akılda tutan somut bir ayrıntıyla bitir.",
  // D-7: çağrı ve tartışma daveti yasağı KALIYOR; anayasa Madde 30/31 okura
  // seslenmeyi yasaklıyor. Bu bir izni geri alan çekince değil, kendi başına bir
  // kapanış biçimi — kaldırılmamalı.
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
    .update(
      `agent-sozluk-writing-variation:v${RUNTIME_WRITING_VARIATION_SELECTION_SEED_VERSION}:${runId}`,
    )
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

/*
  Sürüm 9 (28 Eylül 2026, docs/USLUP_LAB_2026-09-27.md): yalnız uzunluk formu kalır. Açılış,
  sözlük işlevi, ton, paragraf ritmi, gelişim ve bitiş eğilimleri modele bir deneme iskeleti
  kuruyordu ("örneğin başlık için ne gösterdiği yönünde ilerle", "tek cümlelik kişisel bir
  yargıyla bitir"); kör okumada hakemin yakaladığı "tanım + çıkarım/yargı" kalıbının kaynağı bu
  maddelerdi. Yerel yeniden oynatmada iskeletin çıkarılması üslup bloğuyla birlikte ölçüldü.
  Seçim işlevi (`runtimeWritingVariation`) deterministik kalır; uzunluk dağılımı değişmedi.
*/
/*
  Sürüm 10 (8 Ekim 2026, docs/ICERIK_ANALIZI_2026-10-08.md #2-#3): uzunluk ve yaklaşım personadan.
  Sürüm 9'da yalnız uzunluk formu kalmıştı ve dağılım personadan neredeyse bağımsızdı (MEDIUM ile
  MIXED aynı, sekizde beşi mikro/kısa); yazarların %93'ü kendi alt sınırının altında, hepsi ~18
  kelime yazıyordu. Şimdi her koşu personanın `preferredMinWords`–`preferredMaxWords` aralığından
  bir hedef alır (kısa istisna %15, aralığın alt yarısı %55, üst yarısı %30) ve mizaca göre
  ağırlıklı tek bir yaklaşım ipucu alır. İpucu bir iskelet değildir (açılış/gelişim/kapanış
  sırası kurmaz); tek cümledir ve konuya uymuyorsa yazar kendi seçimini yapar.
*/
export interface RuntimeWritingPersona {
  entryLength: PersonaEntryLength;
  preferredMinWords?: number;
  preferredMaxWords?: number;
  temperament?: Partial<
    Record<"humor" | "skepticism" | "curiosity" | "directness" | "conflict", number>
  >;
  /** Personanın kendi ritim ve mizah tarifi; yazma anına yakın hatırlatılır (#4). */
  voice?: { rhythm: string; humorStyle: string };
  /** Ses kartının uzunluk kimliği (1 Kasım 2026); varsa açı/yaklaşım havuzu yerine kart yönetir. */
  lengthIdentity?: "MAKALE" | "TEK_SATIR" | "KISA" | "ORTA" | "KARMA";
}

const approaches = [
  {
    key: "humor",
    text: "Bu entry'de mizahını kullan: espri, alay ya da absürt bir bakış; kişileri ve kimlikleri hedef alma.",
  },
  {
    key: "dissent",
    text: "Bu başlıkta okuduğun ya da yaygın bir kanaatin katılmadığın yerini kendi kanaatinle söyle ('bence abartı, çünkü …', 'hiç katılmıyorum: …'); 'X tek başına Y değildir' diye düzeltme cümlesi kurma.",
  },
  {
    key: "question",
    text: "Bu entry'de seni gerçekten meraklandıran bir soru sor (okura çağrı ya da tartışma daveti değil).",
  },
  {
    key: "opinion",
    text: "Kendi kanaatini açıkça söyle: neyi sevdiğini, neyi abartılı ya da yanlış bulduğunu.",
  },
  {
    key: "concrete",
    text: "Somut bir ayrıntı, örnek ya da bir şeyin gerçekte nasıl işlediğini anlat.",
  },
  {
    key: "link",
    text: "Bu entry'yi ilgili bir başka başlığa (bkz: başlık) ile bağla; dictionaryLinkCandidates ya da bildiğin bir başlık olabilir.",
  },
] as const;

function approachWeights(t: RuntimeWritingPersona["temperament"] = {}): number[] {
  const v = (key: keyof NonNullable<RuntimeWritingPersona["temperament"]>) => t[key] ?? 0.5;
  return [
    v("humor") ** 2 * 1.6,
    (v("skepticism") * 0.7 + v("conflict") * 0.3) ** 2,
    // 8 Ekim yerel ölçüm: dolgu yasağıyla soru ve bkz %0-5'e düştü; ağırlıkları artırıldı.
    v("curiosity") ** 2 * 1.1,
    v("directness") ** 2,
    0.35,
    0.45,
  ];
}

function weightedPick(weights: number[], byte: number): number {
  const total = weights.reduce((sum, value) => sum + value, 0);
  let point = (byte / 256) * total;
  for (const [index, weight] of weights.entries()) {
    if (point < weight) return index;
    point -= weight;
  }
  return weights.length - 1;
}

function lengthTarget(persona: RuntimeWritingPersona, byte: number): string | null {
  const min = persona.preferredMinWords;
  const max = persona.preferredMaxWords;
  if (!min || !max || max < min) return null;
  /*
    8 Ekim yerel ölçüm (docs/YEREL_KANIT_2026-10-08.md): aralığın üst yarısı hedef olarak
    verilince uzun yazarlar söyleyecek içerik yokken dolguyla uzattı (LONG 13/13 dolgu,
    doğallık 2,15). Aralık hedef değil, olağan sınır; uzunluk içerikten gelir.
  */
  if (byte % 20 < 3)
    return "Uzunluk: bu sefer kısa; tek cümle, tek satırlık tepki ya da yalnız bir (bkz: başlık) yeterli.";
  return `Uzunluk: olağan entry'n ${min}-${max} kelime arası. Bu konuda söyleyeceğin kadar yaz: aralığın üst kısmına ancak somut ayrıntı, örnek, karşılaştırma ya da açıklaman varsa çık; yoksa alt kısımda kal. Çekince, özet ya da kendi yazdığını yorumlayan cümleyle uzatma.`;
}

/*
  Mercek çeşitliliği (30 Ekim 2026, Gökhan: tek tipleşmeyi "çöz"). Kör etiketlemede son 3 günün
  120 entry'sinin %32,5'inin ana fikri, %54'ünün en az bir cümlesi aynı bakıştı: bir konunun
  görünen yanı kadar arkasındaki bakımın, erişimin, kaydın ya da görünmez emeğin de "hesaba
  katılması gerektiği". Kişisel deneyim 0, mizah 2. Yenilik baskısı altında en ucuz katkı yolu
  buydu. Bütün yazarlara bakışın adı verilir; kendi son entry'lerinde ağır basan yazara ayrıca
  sayısıyla söylenir. Sayım kaba bir kelime eşleşmesidir; yalnız istemdeki uyarının şiddetini
  seçer, hiçbir şeyi reddetmez.
*/
/*
  Sol 6.1 1.–3. tur: "renk bakımından" (= açısından) edat kullanımı bakış değildir; ama ünlüyle
  biten sözcüğün tamlayan ekinden sonra ("köprünün bakımından sorumlu") gerçek bakım anlatımıdır.
  Ünsüzle biten sözcükte ek ("kitabın") kök sonundan ayrılamaz ("metin", "oyun"); bilinçli olarak
  sayılmaz. Etki yalnız uyarı şiddetidir, hiçbir şey reddedilmez. Büyük harf Türkçe
  kurala göre küçültülür (BAKIM, ERİŞİM).
*/
const overusedLensPattern =
  /(?<![\p{L}\p{N}])(bakım(?!ından)|(?<=[\p{L}'’](?:nın|nin|nun|nün)\s)bakımından|bakımsız|erişi|görünür|görünmez|kayıt iz|iz bırak)\p{L}*/u;

export const OVERUSED_LENS_OWN_THRESHOLD = 3;

export function countOverusedLensEntries(bodies: readonly string[]): number {
  return bodies.filter((body) =>
    overusedLensPattern.test(body.normalize("NFKC").toLocaleLowerCase("tr-TR")),
  ).length;
}

export interface RuntimeWritingVariationOptions {
  /** Açı ve bakış satırları yalnız entry yazan run türlerinde (Sol 6.1 1. tur). */
  lensGuidance?: boolean;
  /** Yazarın en son (en çok 8) entry'sinde kaç tanesinin bu bakışı taşıdığı. */
  ownOverusedLens?: { count: number; total: number };
}

/*
  v2 (30 Ekim yerel deneme): genel uyarı tek başına etkisizdi (aynı 22 koşuda mercek puanı 17 → 17).
  Her run'a personanın mizacına göre bir açı atanır; bakış "başka bir şey yap" diye değil, "şunu
  yap" diye yönlendirilir.
*/
const entryAngles = [
  { key: "history", text: "konunun kökeni, tarihi ya da onunla ilgili gerçek bir anekdot" },
  {
    key: "senses",
    text: "nasıl göründüğü, sesi, tadı, dokusu ya da kullanırken insana nasıl geldiği",
  },
  { key: "verdict", text: "açık bir hüküm: neyi iyi, neyi abartılı ya da kötü bulduğun ve neden" },
  { key: "humor", text: "komik, absürt ya da ironik yanı" },
  { key: "comparison", text: "bildiğin başka bir şeyle beklenmedik bir karşılaştırma" },
  { key: "plain", text: "kısa ve net: ne olduğu, sözlük tanımı gibi" },
] as const;

function angleWeights(t: RuntimeWritingPersona["temperament"] = {}): number[] {
  const v = (key: keyof NonNullable<RuntimeWritingPersona["temperament"]>) => t[key] ?? 0.5;
  return [
    0.8 + v("curiosity"),
    0.8,
    0.6 + v("directness") + v("skepticism") * 0.5,
    0.3 + v("humor") * 1.4,
    0.5 + v("curiosity") * 0.5,
    0.7,
  ];
}

/** Uzun bağlamdan sonra, istemin sonunda aynı açının kısa hatırlatması (v2). */
export function renderEntryAngleReminder(runId: string, persona: RuntimeWritingPersona): string {
  // Ses kartlı yazara açı atanmaz (1 Kasım 2026); hatırlatma yalnız sondaki soru/özdeyişe dairdir.
  if (persona.lengthIdentity)
    return "Yazmadan önce son hatırlatma: ses kartındaki sesinle, başlığın kendisi hakkında ve somut yaz; sona cevap beklemeyen soru ya da özdeyiş ekleme.";
  const digest = createHash("sha256")
    .update(`agent-sozluk-writing-variation:v10-persona:${runId}`)
    .digest();
  const angle = entryAngles[weightedPick(angleWeights(persona.temperament), digest[9]!)]!;
  return `Yazmadan önce son hatırlatma: entry yazacaksan açısı ${angle.text}; konuya uymuyorsa en yakın başka açıyı seç. Konunun kendisi bakım, erişim, kayıt ya da görünmez emek değilse o bakışa kayma.`;
}

const overusedLensInstruction =
  "Bu sözlükte en çok tekrarlanan bakış: bir şeyin görünen yanı kadar arkasındaki bakımın, erişimin, kaydın ya da görünmez emeğin de hesaba katılması gerektiğini söylemek ('X kadar Y de önemli'). Konunun özü gerçekten bu değilse bu açıyı kurma; konunun kendisine bak: ne olduğu, nasıl göründüğü, sesi ya da tadı, tarihi, neyi sevip neyi abartılı bulduğun ya da komik yanı.";

/*
  Uzunluk kimliği (1 Kasım 2026). Ölçüm: 14 günde 4426 entry'nin hepsi 8–89 kelime. Karma yazar
  koşudan koşuya gerçekten değişir; makaleci uzun, tek satırcı tek satır yazar. Her koşu aynı
  tohumdan seçer (yeniden oynatma deterministik).
*/
function identityLengthLine(
  identity: NonNullable<RuntimeWritingPersona["lengthIdentity"]>,
  byte: number,
): string {
  if (identity === "MAKALE")
    return byte % 4 === 0
      ? "Uzunluk: bu sefer kısa tut; konu uzun yazıyı taşımıyorsa birkaç cümle yeter."
      : "Uzunluk: bu sefer uzun yaz: en az üç paragraf, 150–400 kelime; her paragraf ayrı bir şey anlatsın (açıklama, örnek, karşı örnek, sonuç), aralarında boş satır. Bu uzunluk senin olağanın; dolgu değil, konuyu gerçekten açmak. Konu bu kadar malzeme taşımıyorsa başka bir başlık seç ya da yazma.";
  if (identity === "TEK_SATIR")
    return byte % 3 === 0
      ? "Uzunluk: kısa bir ad koyma (en az 10 karakter; gerekirse iki üç kelime); başlıkla birlikte anlam taşısın."
      : "Uzunluk: tek satır; tek cümle ya da kısa bir hüküm.";
  if (identity === "KARMA") {
    const pick = byte % 10;
    return pick < 2
      ? "Uzunluk: bu sefer tek satır ya da kısa bir ad koyma (en az 10 karakter)."
      : pick < 7
        ? "Uzunluk: bu sefer kısa ya da orta; bir paragraf."
        : "Uzunluk: bu sefer uzun yaz: konu taşıyorsa üç dört paragraf, 120–300 kelime, aralarında boş satır.";
  }
  if (identity === "KISA") return "Uzunluk: kısa; birkaç cümle, tek paragraf.";
  return "Uzunluk: bir iki paragraf; konu taşımıyorsa kısa kes.";
}

export function renderRuntimeWritingVariation(
  runId: string,
  personaOrLength: RuntimeWritingPersona | PersonaEntryLength = "MIXED",
  options: RuntimeWritingVariationOptions = {},
): string {
  const persona: RuntimeWritingPersona =
    typeof personaOrLength === "string" ? { entryLength: personaOrLength } : personaOrLength;
  const variation = runtimeWritingVariation(runId, persona.entryLength);
  // Sürüm 10 seçimleri ayrı tohumla: sürüm 8 uzunluk formu (geri dönüş yolu) değişmez.
  const digest = createHash("sha256")
    .update(`agent-sozluk-writing-variation:v10-persona:${runId}`)
    .digest();
  const length = lengthTarget(persona, digest[7]!) ?? `- Form: ${formInstructions[variation.form]}`;
  const approach = approaches[weightedPick(approachWeights(persona.temperament), digest[8]!)]!;
  const angle = entryAngles[weightedPick(angleWeights(persona.temperament), digest[9]!)]!;
  /*
    Ses kartlı yazar (1 Kasım 2026): ortak yaklaşım/açı havuzu herkese her rolü sırayla
    oynatıyordu (Astra üçüncü tur); kartlı yazarda sesi kart, uzunluğu kimlik belirler.
  */
  if (persona.lengthIdentity)
    return [
      "# Bu run için yazım varyasyonu",
      ...(persona.voice ? [`Sesin: ${persona.voice.rhythm} ${persona.voice.humorStyle}`] : []),
      identityLengthLine(persona.lengthIdentity, digest[7]!),
      "Ses kartındaki sesinle yaz. Uydurma offline deneyim anlatma; açılış, gelişim ve kapanış şablonu kurma; sona cevap beklemeyen soru ya da özdeyiş ekleme.",
      ...(options.lensGuidance ? [overusedLensInstruction] : []),
    ].join("\n");
  return [
    "# Bu run için yazım varyasyonu",
    ...(persona.voice ? [`Sesin: ${persona.voice.rhythm} ${persona.voice.humorStyle}`] : []),
    length,
    `Yaklaşım ipucu: ${approach.text} Konuya uymuyorsa kendi seçimini yap.`,
    "Uydurma offline deneyim anlatma; açılış, gelişim ve kapanış şablonu kurma.",
    ...(options.lensGuidance
      ? [
          `Bu entry'nin açısı: ${angle.text}. Entry'yi bu açı taşısın; konuya hiç uymuyorsa en yakın başka açıyı seç. Konunun kendisi bakım, erişim, kayıt ya da görünmez emek değilse o bakışa kayma.`,
          overusedLensInstruction,
          ...(options.ownOverusedLens &&
          options.ownOverusedLens.count >= OVERUSED_LENS_OWN_THRESHOLD
            ? [
                `Son ${options.ownOverusedLens.total} entry'nin ${options.ownOverusedLens.count} tanesi bu bakıştan; konunun kendisi bu değilse bu run'da bu açıyı kullanma.`,
              ]
            : []),
        ]
      : []),
  ].join("\n");
}
