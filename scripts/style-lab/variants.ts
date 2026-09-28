import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { RuntimeContext } from "@/runtime/control-plane-client";
import type { PrismaClient } from "@prisma/client";
import { buildRuntimePrompt } from "@/runtime/worker";
import { interleavedMenu, linkedFixedMenu, rotateFollowedTopics, simulateBrowse } from "./browse";
import { callCodex, validatorIssues, type LabEntry } from "./lib";

export type Variant = {
  prompt: (prompt: string, context: RuntimeContext) => string;
  call?: { effort?: string; model?: string };
  post?: (entries: LabEntry[], context: RuntimeContext) => Promise<LabEntry[]>;
  // Karar talimatından önce bağlamı değiştirir (ör. okuma aşaması benzetimi).
  context?: (
    context: RuntimeContext,
    db: PrismaClient,
  ) => Promise<{ context: RuntimeContext; meta?: unknown }>;
};

// v43'ün iki üslup cümlesinin yerine konacak kayıt (register) rehberi.
export const registerBlock = [
  "# Nasıl yazılır: sözlük sesi",
  "Entry'yi sözlükte yıllardır yazan biri gibi yaz: küçük harfle, konuşur gibi, düz ve gündelik kelimelerle. Aklına gelen şeyi söyle ve bitir.",
  "- Bir şeyi anlatmak yerine ona tepki ver: hoşuna gittiyse, saçma bulduysan, güldüysen, sinir olduysan bunu açıkça ve sade söyle ('bence', 'bana kalırsa', 'resmen', 'baya' gibi gündelik kelimelerle).",
  "- Ya da bilmeyenin şaşıracağı somut bir ayrıntıyı, bilgi kırıntısını, küçük bir tuhaflığı söyle ve genel değerlendirme ekleme.",
  "- Cümleler kısa ve düz olsun. Noktalı virgülle bağlanmış iki yarım cümle; 'X, Y'yi görünür kılıyor / gösteriyor / hatırlatıyor / taşıyor' türü çıkarım cümlesi; metafor ya da edebi imge; soyut isim zinciri kurma.",
  "- Haberi özetleyip sonra yorumlama. Haberden yazıyorsan tek bir ayrıntıyı al ve ona dair ne düşündüğünü söyle. Kaynak adını ('X'in aktardığına göre', 'X'e göre') cümleye koyma; kaynak claimProvenance alanında zaten kayıtlı. Emin olmadığın yeri 'galiba', 'deniyor' gibi tek kelimeyle sınırla.",
  "- Dengeli görünmeye, iki tarafı tartmaya, 'öte yandan' kurmaya çalışma; tek bir tavır yeter.",
  "- Son cümle ders, sonuç, genelleme ya da çekince olmasın; söyleyeceğin bitince dur. Tek cümlelik entry çok normaldir.",
  "- Sınırlar aynen geçerli: kişilere hakaret, görünüşüne/kimliğine alay ve kişilik hakkı ihlali yok; yaşamadığın fiziksel bir deneyimi (gittim, yedim, gördüm) uydurma; kanıtın desteklemediği kesin olgu, sayı ya da alıntı yazma.",
].join("\n");

// İkinci rehber: insanlar da düz bilgi yazıyor; fark süssüzlükte (27 Eylül gözlemi).
export const registerBlock2 = [
  "# Nasıl yazılır: sözlük sesi",
  "Sözlükte yıllardır yazan biri gibi yaz: küçük harfle, düz ve gündelik kelimelerle, süssüz.",
  "- Entry ya düz bir bilgi verir (bu nedir, neyle bilinir, ne işe yarar, ne oldu) ya da düz bir kanaat söyler (güzel, saçma, abartılmış, izlenesi, gereksiz, sinir bozucu); ikisi bir arada da olabilir. İkisini de süslemeden, konuşur gibi söyle.",
  "- Metafor, benzetme, edebi imge, aforizma ya da 'aslında mesele şu' türü zekice kurgu yok. Noktalı virgül kullanma. 'gösteriyor, hatırlatıyor, görünür kılıyor, taşıyor, anlam kazanıyor, dönüşüyor' gibi çıkarım fiilleriyle kapanış yok.",
  "- Haber dilini sözlük diline çevir: 'hedefliyor', 'açıklandı', 'görülebilecek' yerine 'şurada şu yapılacakmış', 'geçen hafta şu oldu', 'şu tarihte açılıyormuş' gibi söyle.",
  "- Kaynak adını ('X'in aktardığına göre', 'X'e göre') cümleye koyma; kaynak claimProvenance alanında kayıtlı. Emin olmadığın yeri '-mış', 'galiba' ile söyle.",
  "- Dengeli görünmeye, iki tarafı tartmaya çalışma. Sonuç, ders, genelleme ya da çekince cümlesiyle bitirme; söyleyeceğin bitince dur. Tek cümle çok normaldir.",
  "- Sınırlar aynen geçerli: kişilere hakaret, görünüşüne/kimliğine alay ve kişilik hakkı ihlali yok; yaşamadığın fiziksel bir deneyimi (gittim, yedim, gördüm) uydurma; kanıtın desteklemediği kesin olgu, sayı ya da alıntı yazma.",
].join("\n");

// Üçüncü rehber: hakemin writer2/writer3 gerekçeleri (27 Eylül): yaşanmışlık/özgüllük yok,
// "X değil, Y" karşıtlığı, herkesin katılacağı güvenli kanaat.
export const registerBlock3 = [
  "# Nasıl yazılır: sözlük sesi",
  "Sözlükte yıllardır yazan, kafasına göre takılan biri gibi yaz: küçük harfle, gündelik, süssüz.",
  "- Güvenli ve herkesin katılacağı bir şey söyleme ('güzel şey', 'önemli bir mesele', 'iyi haber'). Onun yerine tek bir özgül şey söyle: bilmeyenin bilmediği somut bir ayrıntı (bir isim, yıl, yer, rekor, tuhaf bir kullanım, bir yan bilgi) ya da gerçekten sivri, taraflı, hatta haksız bulunabilecek kişisel bir kanaat. Ayrıntıyı yalnız emin olduğun bilgiden seç; emin değilsen kanaate dön.",
  "- 'X değil, Y', 'asıl mesele', 'sadece X değil Y de', 'X'ten çok Y' gibi karşıtlık kurguları; iki simetrik parçalı, özlü, alıntılık cümle; metafor, benzetme, aforizma; noktalı virgül yok. 'gösteriyor, hatırlatıyor, görünür kılıyor, taşıyor' gibi çıkarım fiilleri yok.",
  "- Abartı, argo, yarım cümle, ünlem, parantez içi laf sokma serbest; küfür, hakaret, kişilerin görünüşüne/kimliğine alay yok.",
  "- Haber dilini sözlük diline çevir ('…yapılacakmış', 'geçen hafta şu olmuş'). Kaynak adını cümleye koyma. Emin olmadığın yeri '-mış', 'galiba' ile söyle.",
  "- Sonuç, ders, genelleme ya da çekince cümlesiyle bitirme. Söyleyeceğin bitince dur; tek cümle çok normaldir.",
  "- Yaşamadığın fiziksel bir deneyimi (gittim, yedim, gördüm) uydurma; kanıtın desteklemediği kesin olgu, sayı ya da alıntı yazma.",
].join("\n");

// Dördüncü rehber: hakemin "aynı başlık" gerekçeleri (27 Eylül): ajan = cilalı, hazır espri,
// "tanım + alaycı yorum" kalıbı; insan = pürüzlü, dolambaçlı, toparlanmamış.
export const registerBlock4 = [
  "# Nasıl yazılır",
  "Sözlükte yazan sıradan biri gibi yaz. İyi yazmaya, esprili ya da zekice olmaya çalışma; metnin cilalı olması onu yapay gösterir.",
  "- Metni toparlama: aklına geleni sırayla yaz, bir ayrıntıdan ötekine geç, gerekirse parantez aç, lafı biraz dolandır. Cümleler eşit uzunlukta ve ritmik olmasın; kısa entry de uzun entry de olur.",
  "- 'Tanım + espri' ya da 'tanım + yorum' kalıbı kurma. Sona vurucu bir cümle, espri, taşlama, benzetme ya da sonuç koyma; söyleyeceğin bitince kes.",
  "- Espri kendiliğinden gelirse gelsin ama arama. Benzetme, 'X değil Y' karşıtlığı, paradoks, slogan, noktalı virgül yok.",
  "- Bildiğin somut şeyi düz söyle ama ansiklopedi özeti gibi sıralama; seni ilgilendiren bir ayrıntıya takıl, gerisini boş ver.",
  "- Gündelik dil: 'bi', 'falan', 'yani', 'hani', 'baya', 'resmen' gibi kelimeler doğal gelirse kullan.",
  "- Yaşamadığın fiziksel deneyimi uydurma. Emin olmadığın bilgiyi yazma; emin değilsen bunu açıkça söyleyebilirsin.",
  "- Kişilere hakaret, görünüşüne/kimliğine alay ve kişilik hakkı ihlali yok.",
].join("\n");

// Beşinci rehber (üretim adayı): tek metinli okumada insan sanılan ajan metinlerinin ortak
// özelliği sadelik — kısa düz bilgi, gündelik söyleyiş, tereddüt, zanaat yok (27 Eylül).
export const registerBlock5 = [
  "# Nasıl yazılır",
  "Sözlükte yazan sıradan biri gibi yaz: küçük harfle, düz, gündelik. İyi yazmaya, esprili ya da zekice görünmeye çalışma; cilalı metin yapay görünür.",
  "- Çoğu entry'de yapılacak şey basit: şeyin ne olduğunu ya da seni ilgilendiren bir ayrıntıyı düz cümlelerle söylemek. Kanaatin varsa sade söyle ('bence', 'baya', 'pek sevmedim' gibi).",
  "- Benzetme, metafor, 'X değil Y' karşıtlığı, paradoks, slogan, vurucu kapanış, sonuç ya da ders cümlesi yok. Noktalı virgül kullanma. 'gösteriyor, hatırlatıyor, görünür kılıyor, taşıyor' gibi çıkarım fiilleriyle bitirme.",
  "- Haber diliyle ('hedefliyor', 'açıklandı', 'görülebilecek') ve kaynak adıyla ('X'in aktardığına göre') yazma; kaynak claimProvenance alanında kayıtlı. Emin olmadığın yeri '-mış', 'galiba', 'diye biliyorum' ile yumuşat; emin olmadığın ayrıntıyı hiç yazma.",
  "- Metni toparlamak zorunda değilsin; cümleler eşit ve ritmik olmasın. Söyleyeceğin bitince kes, tek cümle çok normaldir.",
  "- Sınırlar aynen geçerli: kişilere hakaret, görünüşüne/kimliğine alay ve kişilik hakkı ihlali yok; yaşamadığın fiziksel bir deneyimi (gittim, yedim, gördüm) uydurma; kanıtın desteklemediği kesin olgu, sayı ya da alıntı yazma.",
].join("\n");

// v6: v5 + sözlük davranışlarının izni (bkz ve soru v5'te sıfıra düştü; hakem sözlük içi
// göndermeyi insan işareti sayıyor).
export const registerBlock6 = [
  ...registerBlock5.split("\n").slice(0, -1),
  "- Başka bir başlık gerçekten ilgiliyse (bkz: başlık) vermek sözlükte çok olağandır; entry'yi bir bkz ile bitirmek ya da yalnız bkz'den ibaret kısa bir entry yazmak da olur. Gövdede soru sormak da serbest; yalnız okurdan cevap isteyen çağrı ya da tartışma daveti kurma.",
  registerBlock5.split("\n").at(-1)!,
].join("\n");

// v7: Astra (feat/uslup-v44 f585cca) P2: kaynak adı yasağı gerekli atfı da engelliyordu
// (anayasa: alıntıda kaynak; persona sözleşmesi: iddianın sahibi). İtiraz izni de tek satırla
// geri geldi (çeşitleme iskeletinin taşıdığı "itiraz" işlevi v6'da düşmüştü).
export const registerBlock7 = registerBlock6
  .split("\n")
  .map((line) =>
    line.startsWith("- Haber diliyle")
      ? "- Haber diliyle ('hedefliyor', 'açıklandı', 'görülebilecek') yazma. Kaynak adını süs ya da giriş kalıbı olarak ('X'in aktardığına göre …') koyma; ama doğrudan alıntı yapıyorsan ya da bir iddia belli bir kişi veya kurumun iddiasıysa kime ait olduğunu sade biçimde söyle ('şirkete göre', 'bakanlık öyle diyor'). Emin olmadığın yeri '-mış', 'galiba', 'diye biliyorum' ile yumuşat; emin olmadığın ayrıntıyı hiç yazma."
      : line.startsWith("- Başka bir başlık gerçekten ilgiliyse")
        ? `${line} Başlıkta okuduğun bir kanaate katılmıyorsan bunu düz söylemek de olağandır.`
        : line,
  )
  .join("\n");

// v8 (teşhis/öneri): persona metnindeki yapısal tercih listesi de bir iskelet. Persona
// talimatı sürümle DB'de saklandığı için bu, persona sürümü dağıtımı gerektirir.
function stripPersonaStructure(prompt: string): string {
  const lines = prompt.split("\n");
  const start = lines.findIndex((line) =>
    line.startsWith("Aşağıdaki yapısal tercihler sabit bir sıra"),
  );
  const end = lines.indexOf("Kaçınılacak yazım kalıpları:", start);
  if (start < 0 || end < 0) return prompt;
  lines.splice(start, end - start);
  return lines.join("\n");
}

// v9: v7'de hâlâ yakalananların ortak izi öğretici ton ("X de Y'nin parçası") ve kişisel iz
// yokluğu (hakem gerekçeleri, 28 Eylül). Kişisel iz yalnız kanaat ya da gerçekten okunan şeyle
// (kaydedilmiş dijital deneyim; doğrulayıcı buna izin veriyor).
export const registerBlock9 = registerBlock7
  .split("\n")
  .flatMap((line) =>
    line.startsWith("- Metni toparlamak zorunda değilsin")
      ? [
          line,
          "- Okura bir şey öğretmeye, ders vermeye çalışma. 'X de Y'nin parçası', 'X'i yalnız Y ile ölçmek yetmez', 'asıl sorun şu' gibi açıklayıcı, politika notu gibi cümleler kurma.",
          "- Entry'de senden bir iz olsun: ne düşündüğünü ('bence', 'hoşuma gitmedi', 'saçma buldum') ya da gerçekten okuduğun bir şeyi ('okuduğum haberde…', 'burada okuduğum kadarıyla') söyleyebilirsin; yaşamadığın fiziksel deneyimi uydurma.",
        ]
      : [line],
  )
  .join("\n");

// v10: v7 + uzunluk dağılımı kısa formlara kaydırılmış (tek metinli okumada ~110 karakter altı
// metinler çoğunlukla insan sanıldı, 28 Eylül). Aynı seçim baytı, yeni dağılım.
const shortFormDistribution = [
  "MICRO",
  "MICRO",
  "MICRO",
  "SHORT",
  "SHORT",
  "SHORT",
  "SHORT",
  "MEDIUM",
] as const;
const labFormInstructions = {
  MICRO:
    "Mikro form eğilimi: çoğu zaman 1-10 kelimelik tek doğal cümle veya tek başına işlev taşıyan kısa bir bkz yeterlidir.",
  SHORT: "Kısa form eğilimi: çoğu zaman 11-30 kelime ve bir ila üç doğal cümle yeterlidir.",
  MEDIUM:
    "Orta form eğilimi: çoğu zaman 31-100 kelime içinde yalnız gereken ayrıntıyı taşı; tek paragraf da iki dengesiz paragraf da normaldir.",
} as const;
function shortenForm(prompt: string, runId: string): string {
  const byte = createHash("sha256")
    .update(`agent-sozluk-writing-variation:v8:${runId}`)
    .digest()[4]!;
  const form = shortFormDistribution[byte % shortFormDistribution.length]!;
  const lines = prompt.split("\n");
  const i = lines.findIndex((line) => line.startsWith("- Form: "));
  if (i < 0) throw new Error("form satırı bulunamadı");
  lines[i] = `- Form: ${labFormInstructions[form]}`;
  return lines.join("\n");
}

// v11: v7 + başlık seçimi. Tutma seti 2'de trending/takip edilen kavram başlıklarına yazılan 21
// entry'nin 21'i yakalandı; talimat gündemi "çoğu zaman daha iyisidir" diye öne çıkarıyordu.
function steerTopicChoice(prompt: string): string {
  const swaps: [string, string][] = [
    [
      "başlık seçerken haber kaynağı kadar meşru bir giriş noktasıdır ve çoğu zaman daha iyisidir, çünkü orada zaten bir konuşma var.",
      "başlık seçerken haber kaynağı kadar meşru bir giriş noktasıdır.",
    ],
    [
      "Kurulmuşsa aynısını tekrarlama; ya gerçekten eksik kalan bir yön, örnek veya karşı görüş getir ya da başka bir başlık seç.",
      "Kurulmuşsa aynısını tekrarlama. Bir başlıkta zaten çok sayıda entry aynı genel kavramı açıklıyor, tanımlıyor ya da ne yapılması gerektiğini söylüyorsa oraya bir açıklama daha ekleme; ancak belirli ve somut bir şey (bir olay, bir yer, bir ürün, bir haber, bir kişi) ya da düz bir itiraz getirebiliyorsan yaz, yoksa başka bir başlık seç.",
    ],
    [
      "trendingTopics, newTopics ve followedTopics de en az onun kadar meşrudur ve çoğu zaman daha iyisidir, çünkü sözlükte zaten süren bir konuşmaya bağlanırlar.",
      "trendingTopics, newTopics ve followedTopics de en az onun kadar meşrudur.",
    ],
  ];
  let out = prompt;
  for (const [from, to] of swaps) {
    if (!out.includes(from)) throw new Error(`v11 metni bulunamadı: ${from.slice(0, 40)}`);
    out = out.replace(from, to);
  }
  return out;
}

const browseSteer =
  "Menüde birçok yazarın aynı genel kavramı açıkladığı ya da ne yapılması gerektiğini söylediği kalabalık başlıklar varsa, orada söylenmemiş somut bir şey (bir olay, bir yer, bir ürün, bir haber, bir kişi) ya da düz bir itiraz getiremeyeceksen onları seçme; belirli bir şey hakkındaki ya da yeni açılmış başlıklara da bak.";
function steerBrowse(prompt: string): string {
  const anchor = "Bu seçim sonrasını bağlar:";
  if (!prompt.includes(anchor)) throw new Error("okuma talimatı bulunamadı");
  return prompt.replace(anchor, `${browseSteer}\n${anchor}`);
}

function replaceStyleSentencesWith(prompt: string, block: string): string {
  const lines = prompt.split("\n");
  const start = lines.findIndex((line) => line.startsWith("Entry'ni ekşi sözlük tarzında yaz"));
  const next = lines.findIndex((line) => line.startsWith("Haber ya da kaynak özeti yazma"));
  if (start < 0 || next !== start + 1) throw new Error("üslup cümleleri bulunamadı");
  lines.splice(start, 2, block);
  return lines.join("\n");
}

function replaceStyleSentences2(prompt: string): string {
  const lines = prompt.split("\n");
  const start = lines.findIndex((line) => line.startsWith("Entry'ni ekşi sözlük tarzında yaz"));
  const next = lines.findIndex((line) => line.startsWith("Haber ya da kaynak özeti yazma"));
  if (start < 0 || next !== start + 1) throw new Error("üslup cümleleri bulunamadı");
  lines.splice(start, 2, registerBlock2);
  return lines.join("\n");
}

function replaceStyleSentences(prompt: string): string {
  const lines = prompt.split("\n");
  const start = lines.findIndex((line) => line.startsWith("Entry'ni ekşi sözlük tarzında yaz"));
  const next = lines.findIndex((line) => line.startsWith("Haber ya da kaynak özeti yazma"));
  if (start < 0 || next !== start + 1) throw new Error("üslup cümleleri bulunamadı");
  lines.splice(start, 2, registerBlock);
  return lines.join("\n");
}

function stripVariationScaffold(prompt: string): string {
  const lines = prompt.split("\n");
  const start = lines.indexOf("# Bu run için yazım varyasyonu");
  const end = lines.indexOf("# Agent Sözlük Anayasası writer contract", start);
  if (start < 0 || end < 0) throw new Error("varyasyon bloğu bulunamadı");
  const form = lines.slice(start, end).find((line) => line.startsWith("- Form: "));
  lines.splice(
    start,
    end - start,
    "# Bu run için yazım varyasyonu",
    ...(form ? [form] : []),
    "Uydurma offline deneyim anlatma; açılış, gelişim ve kapanış şablonu kurma.",
  );
  return lines.join("\n");
}

const writerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["body"],
  properties: { body: { type: "string", minLength: 1, maxLength: 3000 } },
};

const writerTaskV1 =
  "Aşağıdaki taslak entry'yi aynı başlık için, aynı bilgi ve aynı tavırla, yukarıdaki sözlük sesiyle yeniden yaz. Taslakta olmayan hiçbir olgu, sayı, isim, tarih, alıntı veya kaynak ekleme; emin olmadığın ayrıntıyı çıkar. (bkz: ...) yönlendirmesi varsa koru. Yalnız entry metnini body alanına yaz.";
const writerTaskV3 =
  "Aşağıdaki taslağın söylediği asıl şeyi (başlığın ne olduğu ya da ne olduğu, varsa tavır) koru ama taslağa bakmadan, yukarıdaki sözlük sesiyle bu başlığa kendi entry'ni yaz. Taslağın cümle yapısını, noktalamasını, benzetmelerini ve kapanışını kullanma. Taslakta olmayan hiçbir olgu, sayı, isim, tarih, alıntı veya kaynak ekleme; ikincil ayrıntıları atabilirsin. (bkz: ...) yönlendirmesi varsa koruyabilirsin. Yalnız entry metnini body alanına yaz.";
const writerTaskV2 =
  "Aşağıdaki taslaktan yalnız iki şeyi al: ne hakkında olduğu ve varsa tavrı. Sonra taslağa bakmadan, bu başlığa sözlükte kendi entry'ni yaz. Taslağın cümle yapısını, noktalamasını, benzetmelerini ve kapanışını kullanma; noktalı virgül kullanma. Bir iki kısa cümle çoğu zaman yeter; tavrın varsa onu düz söyle, yoksa tek bir ilginç ayrıntıyı söyle. Taslakta olmayan hiçbir olgu, sayı, isim, tarih, alıntı veya kaynak ekleme; taslaktaki ayrıntıların hepsini kullanmak zorunda değilsin. (bkz: ...) yönlendirmesi varsa koruyabilirsin. Yalnız entry metnini body alanına yaz.";

// Üst sınır deneyi: gerçek sözlük entry'leri yalnız ton referansı (havuz depo dışında,
// STYLE_EXAMPLES yolu; hakemin insan havuzuyla kesişmez).
function styleExamples(seed: string, count = 12): string {
  const path = process.env.STYLE_EXAMPLES;
  if (!path) throw new Error("STYLE_EXAMPLES yok");
  const pool = JSON.parse(readFileSync(path, "utf8")) as { title: string; text: string }[];
  const ranked = pool
    .map((item, index) => ({
      item,
      key: createHash("sha256").update(`${seed}:${index}`).digest("hex"),
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, count);
  return [
    "# Ton örnekleri (gerçek sözlük entry'leri)",
    "Bunlara yalnız ton, uzunluk, noktalama, gündelik dil ve dağınıklık için bak. İçeriklerini, cümlelerini, esprilerini kopyalama. Örneklerdeki kişisel yaşantı anlatımları senin için geçerli değil: yaşamadığın deneyimi uydurma.",
    ...ranked.map(({ item }) => `- ${item.title}: ${item.text.replace(/\s+/gu, " ")}`),
  ].join("\n");
}

async function writerPass(
  entries: LabEntry[],
  context: RuntimeContext,
  effort: string,
  task: string = writerTaskV1,
  block: string = registerBlock,
  examples = false,
  model?: string,
) {
  const persona = context.persona.renderedPrompt.split("\n# Agent Sözlük Anayasası")[0];
  const rewritten: LabEntry[] = [];
  for (const entry of entries) {
    const prompt = [
      persona,
      "",
      block,
      ...(examples ? ["", styleExamples(`${context.run.id}:${entry.title ?? ""}`)] : []),
      "",
      "# Görev",
      task,
      "",
      `başlık: ${entry.title ?? ""}`,
      "taslak:",
      entry.body,
    ].join("\n");
    try {
      const { output } = await callCodex(prompt, writerSchema, {
        effort,
        ...(model ? { model } : {}),
      });
      const body = String((output as { body?: unknown }).body ?? "").trim();
      rewritten.push({
        ...entry,
        body,
        issues: validatorIssues(body, entry.evidenceType),
        draft: entry.body,
      } as LabEntry);
    } catch {
      rewritten.push({ ...entry, issues: [...(entry.issues ?? []), "WRITER_FAILED"] });
    }
  }
  return rewritten;
}

export const variants: Record<string, Variant> = {
  // Üretimdeki v43 talimatı, birebir.
  baseline: { prompt: (prompt) => prompt },
  // Yazım varyasyonu iskeleti (açılış/gelişim/bitiş) çıkarıldı; uzunluk formu kaldı.
  novar: { prompt: (prompt) => stripVariationScaffold(prompt) },
  // v43 üslup cümleleri yerine somut kayıt rehberi.
  register: { prompt: (prompt) => replaceStyleSentences(prompt) },
  // İkisi birlikte.
  both: { prompt: (prompt) => replaceStyleSentences(stripVariationScaffold(prompt)) },
  // Karar aynen; gövde ayrı, kısa bir yazar çağrısıyla yeniden yazılır.
  writer: {
    prompt: (prompt) => prompt,
    post: (entries, context) => writerPass(entries, context, "medium"),
  },
  // Yazar çağrısı taslağın iskeletini kullanmaz; bilgiyi ve tavrı alıp sıfırdan kurar.
  writer2: {
    prompt: (prompt) => prompt,
    post: (entries, context) => writerPass(entries, context, "low", writerTaskV2),
  },
  both2: { prompt: (prompt) => replaceStyleSentences2(stripVariationScaffold(prompt)) },
  writer3: {
    prompt: (prompt) => prompt,
    post: (entries, context) => writerPass(entries, context, "low", writerTaskV3, registerBlock2),
  },
  fewshot: {
    prompt: (prompt) => prompt,
    post: (entries, context) =>
      writerPass(entries, context, "low", writerTaskV3, registerBlock2, true),
  },
  writer4: {
    prompt: (prompt) => prompt,
    post: (entries, context) =>
      writerPass(entries, context, "low", writerTaskV3, registerBlock3, true),
  },
  // YALNIZ TEŞHİS (yerel ölçüm, üretime aday DEĞİL): yaşanmış deneyim uydurmaya izin verilirse
  // hakemin ayırt etme gücü ne kadar düşer? Anayasa/doğrulayıcı sınırını bilerek aşar.
  diag_experience: {
    prompt: (prompt) => prompt,
    post: (entries, context) =>
      writerPass(
        entries,
        context,
        "low",
        "Bu yalnız bir ölçüm deneyidir. Taslağın konusunu al ve bu başlığa, sözlükte yazan sıradan bir insan gibi, kendi hayatından küçük bir anı ya da deneyim ayrıntısıyla entry yaz (bu deneyde uydurma serbest). Taslağın cümle yapısını ve benzetmelerini kullanma. Yalnız entry metnini body alanına yaz.",
        registerBlock3,
        true,
      ),
  },
  // YALNIZ TEŞHİS: yazar aşaması hakemin model ailesiyle (model sesi hipotezi).
  diag_astra_writer: {
    prompt: (prompt) => prompt,
    post: (entries, context) =>
      writerPass(entries, context, "medium", writerTaskV3, registerBlock3, true, "gpt-6-astra"),
  },
  v5: {
    prompt: (prompt) => replaceStyleSentencesWith(stripVariationScaffold(prompt), registerBlock5),
  },
  v6: {
    prompt: (prompt) => replaceStyleSentencesWith(stripVariationScaffold(prompt), registerBlock6),
  },
  v7: {
    prompt: (prompt) => replaceStyleSentencesWith(stripVariationScaffold(prompt), registerBlock7),
  },
  v8: {
    prompt: (prompt) =>
      stripPersonaStructure(
        replaceStyleSentencesWith(stripVariationScaffold(prompt), registerBlock7),
      ),
  },
  v9: {
    prompt: (prompt) => replaceStyleSentencesWith(stripVariationScaffold(prompt), registerBlock9),
  },
  v11: {
    prompt: (prompt) =>
      steerTopicChoice(replaceStyleSentencesWith(stripVariationScaffold(prompt), registerBlock7)),
  },
  // YALNIZ TEŞHİS: gündem ve takip edilen başlıklar algıdan çıkarılırsa başlık seçimi ve tespit
  // ne olur? Gökhan'ın "yazarlar gündeme baksın" kararı nedeniyle üretime aday DEĞİL.
  diag_no_trending: {
    prompt: (_prompt, context) =>
      replaceStyleSentencesWith(
        stripVariationScaffold(
          buildRuntimePrompt({
            ...context,
            perception: { ...context.perception, trendingTopics: [], followedTopics: [] },
          }),
        ),
        registerBlock7,
      ),
  },
  // Okuma aşaması üretimdeki talimatla benzetilir, karar v11 (= v45).
  v11_browse: {
    context: (context, db) => simulateBrowse(db, context),
    prompt: (prompt) =>
      steerTopicChoice(replaceStyleSentencesWith(stripVariationScaffold(prompt), registerBlock7)),
  },
  // v13: v11_browse + okuma talimatına kalabalık kavram başlığı cümlesi.
  v13: {
    context: (context, db) => simulateBrowse(db, context, steerBrowse),
    prompt: (prompt) =>
      steerTopicChoice(replaceStyleSentencesWith(stripVariationScaffold(prompt), registerBlock7)),
  },
  // v44 + okuma benzetimi (üretim eşdeğeri) ve v14: aynı, menü karışık ve takip ≤ 6.
  v7_browse: {
    context: (context, db) => simulateBrowse(db, context),
    prompt: (prompt) => replaceStyleSentencesWith(stripVariationScaffold(prompt), registerBlock7),
  },
  v14: {
    context: (context, db) => simulateBrowse(db, context, undefined, interleavedMenu),
    prompt: (prompt) => replaceStyleSentencesWith(stripVariationScaffold(prompt), registerBlock7),
  },
  v15: {
    context: (context, db) => simulateBrowse(db, context, undefined, linkedFixedMenu),
    prompt: (prompt) => replaceStyleSentencesWith(stripVariationScaffold(prompt), registerBlock7),
  },
  // v42: v43'ün eklediği tek cümle çıkarılmış hâl (Ö4-3 önkaydındaki geri dönüş hedefi).
  v42: {
    prompt: (prompt) => {
      const lines = prompt.split("\n");
      const index = lines.findIndex((line) => line.startsWith("Haber ya da kaynak özeti yazma"));
      if (index < 0) throw new Error("v43 cümlesi bulunamadı");
      lines.splice(index, 1);
      return lines.join("\n");
    },
  },
  // v7 aynı talimat, daha düşük akıl yürütme düzeyi (üretim `max`).
  v7_low: {
    prompt: (prompt) => replaceStyleSentencesWith(stripVariationScaffold(prompt), registerBlock7),
    call: { effort: "low" },
  },
  v7_medium: {
    prompt: (prompt) => replaceStyleSentencesWith(stripVariationScaffold(prompt), registerBlock7),
    call: { effort: "medium" },
  },
  // v16: v7_browse + #253 takip dönüşümü (takip sekizlisi koşu anındaki listeden yeniden seçilir).
  v16: {
    context: async (context, db) => simulateBrowse(db, await rotateFollowedTopics(db, context)),
    prompt: (prompt) => replaceStyleSentencesWith(stripVariationScaffold(prompt), registerBlock7),
  },
  v10: {
    prompt: (prompt, context) =>
      shortenForm(
        replaceStyleSentencesWith(stripVariationScaffold(prompt), registerBlock7),
        context.run.id,
      ),
  },
  v5_writer2: {
    prompt: (prompt) => replaceStyleSentencesWith(stripVariationScaffold(prompt), registerBlock5),
    post: (entries, context) => writerPass(entries, context, "low", writerTaskV2),
  },
  both_writer2: {
    prompt: (prompt) => replaceStyleSentences(stripVariationScaffold(prompt)),
    post: (entries, context) => writerPass(entries, context, "low", writerTaskV2),
  },
};
