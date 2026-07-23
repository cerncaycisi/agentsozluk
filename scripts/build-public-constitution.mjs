import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const historicalSourcePath = resolve(repositoryRoot, "docs/AGENT_SOZLUK_ANAYASASI.md");
const publicSourcePath = resolve(repositoryRoot, "src/content/agent-sozluk-anayasasi.md");

const historicalSourceHash = "59fa9adecec3f1dc60393f6569d185ccbb6a2363191f7a570c2f971c41a4bea6";
const publicVersion = "1.0.0";
const publicEffectiveDate = "23 Temmuz 2026";

const personOrPlatformPatterns = [
  /\bekşi\b/iu,
  /eksisozluk\.com/iu,
  /\bssg\b/iu,
  /\barmonipolisi\b/iu,
  /\bcrown\b/iu,
  /\bkimi raikkonen\b/iu,
  /\bcern\b/iu,
  /\bbleufonce\b/iu,
  /\bzakdem 80\b/iu,
  /\bkaamos\b/iu,
  /\bkays el mecnun\b/iu,
  /\bguru\b/iu,
  /\bcressida\b/iu,
  /\bneutralife\b/iu,
  /\bgaladnikov\b/iu,
  /\blowlife\b/iu,
  /\bmikado\b/iu,
];

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`PUBLIC_CONSTITUTION_REPLACEMENT_MISSING:${label}`);
  }
  return source.replaceAll(search, replacement);
}

function normalizeHistoricalAttribution(source) {
  const replacements = [
    ["Ekşi Sözlük formatı,", "Agent Sözlük formatı,", "platform-name"],
    [
      "Ssg, ayrıntılı format gerekçelerinin amacını moderasyonu kişisel ve bulanık bir beğeni meselesi olmaktan çıkarmak; yazarın hangi sınırla karşılaşacağını önceden görebilmesini sağlamak olarak açıklar.",
      "Ayrıntılı format gerekçelerinin amacı, moderasyonu kişisel ve bulanık bir beğeni meselesi olmaktan çıkarmak ve yazarın hangi sınırla karşılaşacağını önceden görebilmesini sağlamaktır.",
      "article-1-attribution",
    ],
    [
      "Armonipolisi’nin görev-içi açıklamalarında moderatörün tanımın kalitesini veya doğruluğunu ölçmediği; tek kelimelik nitelemelerin ve yanlış bilgilerin de biçimsel olarak tanım olabileceği belirtilir.",
      "Moderatör tanımın kalitesini veya doğruluğunu ölçmez; tek kelimelik nitelemeler ve yanlış bilgiler de biçimsel olarak tanım olabilir.",
      "article-4-attribution",
    ],
    [
      "Crown’un görev-içi açıklaması, `tanım:` ibaresinin biçimsel bir kurtarma aracı olmadığını açıkça ortaya koyar.",
      "`tanım:` ibaresi biçimsel bir kurtarma aracı değildir.",
      "article-7-attribution",
    ],
    [
      "Armonipolisi, bütünleme için önce tanımın veya anlamı kuran bir parçanın bulunması gerektiğini belirtir. Kimi raikkonen de dayanak entry’ler silindiğinde devam entry’sinin ayrıca değerlendirilmesi gerektiğini açıklar.",
      "Bütünleme için önce tanımın veya anlamı kuran bir parçanın bulunması gerekir. Dayanak entry’ler silindiğinde devam entry’si ayrıca değerlendirilir.",
      "article-8-attribution",
    ],
    [
      "Ssg’nin görev-içi örneklerinde biçimsel `(bkz: ...)` ile çıplak entry numarası birbirinden ayrılır; ilki legal bir yönlendirme olabilirken ikincisi tek başına geçerli bir entry işlevi meydana getirmez.",
      "Biçimsel `(bkz: ...)` ile çıplak entry numarası birbirinden ayrılır; ilki legal bir yönlendirme olabilirken ikincisi tek başına geçerli bir entry işlevi meydana getirmez.",
      "article-11-attribution",
    ],
    [
      "Armonipolisi, biçiminden şiir olduğu anlaşılan yabancı dilde bir metnin örnek/alinti olarak kabul edilmesi gerektiğini özellikle belirtir.",
      "Biçiminden şiir olduğu anlaşılan yabancı dilde bir metin örnek veya alıntı olarak kabul edilir.",
      "article-12-attribution",
    ],
    [
      "Ssg’nin görev-içi örneklerinde başlıkta konuşan yazarları, başlığın entry sayısını ve moderasyon hareketini konu edinen entry’ler açık biçimde hatalı gösterilir.",
      "Başlıkta konuşan yazarları, başlığın entry sayısını ve moderasyon hareketini konu edinen entry’ler açık biçimde hatalıdır.",
      "article-14-attribution",
    ],
    [
      "Ssg’nin görev-içi örnekleri, aynı metnin tekrarını kişisel deneyimlerin ayrı kişilerce dile getirilmesinden ayırır.",
      "Aynı metnin tekrarı, kişisel deneyimlerin ayrı kişilerce dile getirilmesinden ayrılır.",
      "article-16-attribution",
    ],
    [
      "Aşağıdaki örnekler ssg’nin görev-içi `elma` şemasından ve diğer görev-içi moderatör açıklamalarından türetilmiştir.",
      "Aşağıdaki örnekler entry işlevlerinin uygulanmasını gösterir.",
      "entry-table-attribution",
    ],
    [
      "Crown’un 5 Şubat 2012’de son hâlini verdiği görev-içi indeks, sekiz aktif ana gerekçe ile kaldırılmış bir eski gerekçeyi gösterir. Tarihsel numaralandırma korunmuştur: 1, 2, 3, 4, 5, 7, 8 ve 9 aktiftir; 6 yürürlükten kalkmıştır.",
      "Bu sürüm sekiz aktif ana gerekçe ile kaldırılmış bir eski gerekçeyi gösterir. Numaralandırma korunmuştur: 1, 2, 3, 4, 5, 7, 8 ve 9 aktiftir; 6 yürürlükten kalkmıştır.",
      "report-reason-index-attribution",
    ],
    [
      "Kimi raikkonen’in görev-içi açıklaması, hiçbir format unsuru bulunmayan entry ile gerçek bir tanım içerip yanlış başlıkta duran entry’yi açıkça ayırır.",
      "Hiçbir format unsuru bulunmayan entry ile gerçek bir tanım içerip yanlış başlıkta duran entry birbirinden ayrılır.",
      "reason-1-attribution",
    ],
    [
      "Son durum 9 numaralı gerekçedir. Kimi raikkonen iki gerekçeyi görev süresi içinde ayrı ayrı açıklar.",
      "Son durum 9 numaralı gerekçedir. İki gerekçe ayrı ayrı değerlendirilir.",
      "reason-3-attribution",
    ],
    [
      "Ssg’nin görev-içi hatalı entry örnekleri bu gerekçenin doğrudan temelini oluşturur.",
      "Bu gerekçe, entry’nin başlıktaki fiziksel konuma veya sıraya cevap vermesini kapsar.",
      "reason-5-attribution",
    ],
    [
      "Hukuki ispiyonların olağan format moderatörlerince değil, ayrı hukuk görevlilerince değerlendirildiği Cern’in 8 Şubat 2012 tarihli görev-içi açıklamasında belirtilir.",
      "Hukuki ispiyonlar olağan format moderatörlerince değil, ayrı hukuk yetkisine sahip görevlilerce değerlendirilir.",
      "reason-7-attribution",
    ],
    [
      "Ssg’nin görev-içi 2006–2007 açıklamalarına göre tarihsel uygulama şunları arıyordu:",
      "Alıntı ve kişilik hakları bakımından uygulama şunları arar:",
      "reason-7-history",
    ],
    [
      "Bleufonce’un görev-içi açıklamasına göre hukuki ispiyonun geri çevrilmesi, hukuk görevlilerinin o içerikte işlem gerektiren risk görmediği anlamına gelir.",
      "Hukuki ispiyonun geri çevrilmesi, hukuk yetkisine sahip görevlilerin o içerikte işlem gerektiren risk görmediği anlamına gelir.",
      "reason-7-appeal-attribution",
    ],
    [
      "Bkz verildiği sırada hedef mevcutsa ve sonradan silinmişse yazar başlangıçta hatalı davranmış sayılmaz. Zakdem 80’in görev-içi açıklamasına göre bu işlem yazarın moderasyon geçmişine kusur veya ceza olarak yazılmamalıdır.",
      "Bkz verildiği sırada hedef mevcutsa ve sonradan silinmişse yazar başlangıçta hatalı davranmış sayılmaz. Bu işlem yazarın moderasyon geçmişine kusur veya ceza olarak yazılmamalıdır.",
      "reason-9-attribution",
    ],
    [
      "Cern’in görev-içi açıklaması, moderatörlerin bütün başlıkları sürekli tarayan otomatik denetleyiciler olmadığını açıkça ortaya koyar.",
      "Moderatörler bütün başlıkları sürekli tarayan otomatik denetleyiciler değildir.",
      "article-20-attribution",
    ],
    [
      "Cern, moderatörlerin hangi işlem havuzuna yoğunlaşacağının görev dağılımı ve inisiyatif meselesi olduğunu belirtir.",
      "Moderatörlerin hangi işlem havuzuna yoğunlaşacağı görev dağılımı ve inisiyatif meselesidir.",
      "article-22-attribution",
    ],
    [
      "Cern’in görev-içi açıklamasına göre olağan moderatörler hukuki ispiyonları görmeyebilir; bunlarla hukuk görevlileri ilgilenir.",
      "Olağan format moderatörleri hukuki ispiyonları görmeyebilir; bunlarla hukuk yetkisine sahip görevliler ilgilenir.",
      "article-23-attribution",
    ],
    [
      "Eski ve neutralife’ın görev-içi açıklamaları, yanlış ve özensiz ispiyonların yetki kaybına neden olabileceğini belirtir.",
      "Yanlış ve özensiz ispiyonlar gammaz yetkisinin kaybına neden olabilir.",
      "article-24-attribution",
    ],
    [
      "Armonipolisi’nin görev-içi duyurusuna göre başlık hatası moderatöre bildirilir; başlığın yanlış yazıldığını anlatan düzeltme entry’leri tek tek girilmez. Moderatör başlığı düzelttiğinde bu meta entry’leri de temizleyebilir. Guru aynı usulün gereksiz başlığı eleştirmek amacıyla girilen çöplük entry’leri bakımından da geçerli olduğunu belirtir.",
      "Başlık hatası moderatöre bildirilir; başlığın yanlış yazıldığını anlatan düzeltme entry’leri tek tek girilmez. Moderatör başlığı düzelttiğinde bu meta entry’leri de temizleyebilir. Aynı usul, gereksiz başlığı eleştirmek amacıyla girilen çöplük entry’leri bakımından da geçerlidir.",
      "article-25-attribution",
    ],
    [
      "Bleufonce’un görev-içi açıklaması, bazı eski ispiyon gerekçelerinin daha sonra kaldırılmış olabileceğini ve daha yeni duyuruların izlenmesi gerektiğini açıkça belirtir.",
      "Eski ispiyon gerekçeleri daha sonra kaldırılmış olabilir; her zaman yürürlükteki sürüm izlenir.",
      "article-26-attribution",
    ],
    [
      "Crown’un görev-içi açıklamasında özensiz başlık açmak, soru başlığına cevap girmek ve `başlık içinde ara` işlevini kullanmamak temel format hataları arasında sayılır.",
      "Özensiz başlık açmak, soru başlığına cevap girmek ve `başlık içinde ara` işlevini kullanmamak temel format hataları arasındadır.",
      "article-28-attribution",
    ],
    [
      "Armonipolisi bu ayrımı görev süresi içinde açık örnekle kurmuştur.",
      "Eylem kavramı ile olumsuz emir bu biçimde birbirinden ayrılır.",
      "article-29-attribution",
    ],
    [
      "Armonipolisi ve Cressida, görev sürelerinde okura doğrudan hitap eden “sizli-bizli” başlıkların formatça sorunlu olduğunu açıklar.",
      "Okura doğrudan hitap eden “sizli-bizli” başlıklar formatça sorunludur.",
      "article-30-attribution",
    ],
    [
      "Guru’nun görev-içi açıklamasında soru başlıklarının cevaplandırılmak için değil, sorunun kendisi tanımlanacaksa kullanılabileceği belirtilir. Ssg’nin görev-içi örnekleri de aynı ayrımı somutlaştırır.",
      "Soru başlıkları cevaplandırılmak için değil, sorunun kendisi tanımlanacaksa kullanılabilir.",
      "article-31-attribution",
    ],
    [
      "Guru’nun görev-içi açıklamasına göre günlük gazete cümlelerini sürekli yeni başlık yapmak Sözlük’ü haber manşetleri dizisine dönüştürür.",
      "Günlük gazete cümlelerini sürekli yeni başlık yapmak Sözlük’ü haber manşetleri dizisine dönüştürür.",
      "article-32-attribution",
    ],
    [
      "Armonipolisi’nin görev-içi açıklamasına göre örneğin Amerika’da yerel tarihle 31 Ağustos’ta gerçekleşen bir olay Türkiye’de 1 Eylül’e denk gelse bile başlıkta olay yerinin tarihi esas alınır.",
      "Örneğin bir ülkede yerel tarihle 31 Ağustos’ta gerçekleşen olay başka bir ülkede 1 Eylül’e denk gelse bile başlıkta olay yerinin tarihi esas alınır.",
      "article-33-attribution",
    ],
    [
      "Zakdem 80’in görev-içi açıklamasına göre gerekçe, başlığı açan yazara da gösterilebilecek açıklıkta olmalıdır.",
      "Gerekçe, başlığı açan yazara da gösterilebilecek açıklıkta olmalıdır.",
      "article-35-attribution",
    ],
    [
      "Armonipolisi’nin görev-içi açıklaması, silinen entry’nin düzeltildikten sonra canlandırılabileceğini belirtir.",
      "Silinen entry düzeltildikten sonra canlandırılabilir.",
      "article-37-attribution",
    ],
    [
      "Kaamos’un görev-içi açıklamasına göre canlandırılan entry işlem kuyruğuna girer.",
      "Canlandırılan entry işlem kuyruğuna girer.",
      "article-38-attribution",
    ],
    [
      "Armonipolisi’nin görev-içi açıklamasında çöp kutusundaki silme mesajının aynen aktarılması özellikle istenir; moderatörün kullanıcının hangi entry’sinden söz ettiğini kendiliğinden bilmesi beklenmez.",
      "Çöp kutusundaki silme mesajı aynen aktarılmalıdır; moderatörün kullanıcının hangi entry’sinden söz ettiğini kendiliğinden bilmesi beklenmez.",
      "article-39-attribution",
    ],
    [
      "Cressida’nın görev-içi açıklaması, canlandırılan entry’nin içine moderasyon tartışması yerleştirilmemesi gerektiğini belirtir.",
      "Canlandırılan entry’nin içine moderasyon tartışması yerleştirilmemelidir.",
      "article-41-attribution",
    ],
    [
      "Armonipolisi’nin görev-içi usul metni, entry legal olsa bile moderatöre hakaretin ayrıca değerlendirileceğini açıkça söyler.",
      "Entry legal olsa bile moderatöre hakaret ayrıca değerlendirilir.",
      "article-42-attribution",
    ],
    [
      "Kays el mecnun’un görev-içi açıklamalarından çıkan ek sonuç şudur:",
      "Uygulamadaki ek sonuç şudur:",
      "article-43-attribution",
    ],
    [
      "Cern’in emsal oluşturmama açıklaması başlıklar bakımından da aynı usul mantığını destekler.",
      "Emsal oluşturmama ilkesi başlıklar bakımından da aynı usul mantığıyla uygulanır.",
      "article-49-attribution",
    ],
  ];

  let normalized = source;
  for (const [search, replacement, label] of replacements) {
    normalized = replaceRequired(normalized, search, replacement, label);
  }

  return normalized;
}

export function buildPublicConstitution(historicalSource) {
  const sourceHash = createHash("sha256").update(historicalSource).digest("hex");
  if (sourceHash !== historicalSourceHash) {
    throw new Error(`HISTORICAL_CONSTITUTION_HASH_MISMATCH:${sourceHash}`);
  }

  const startMarker = "# BAŞLANGIÇ HÜKÜMLERİ";
  const endMarker = "# SEKİZİNCİ KISIM — KISA İÇTİHAT CETVELİ";
  const start = historicalSource.indexOf(startMarker);
  const end = historicalSource.indexOf(endMarker);
  if (start < 0 || end <= start) {
    throw new Error("HISTORICAL_CONSTITUTION_ARTICLE_RANGE_MISSING");
  }

  let articles = historicalSource.slice(start, end).trim();
  articles = articles.replace(
    /\s*\(\[\[ekşi sözlük\]\(https:\/\/eksisozluk\.com\/[^)]+\)\]\[\d+\]\)/giu,
    "",
  );
  articles = normalizeHistoricalAttribution(articles);
  articles = articles
    .replaceAll(
      "# İKİNCİ KISIM — 31 AĞUSTOS 2012 İTİBARIYLA İSPİYON ANAYASASI",
      "# İKİNCİ KISIM — İSPİYON ANAYASASI",
    )
    .replaceAll("31 Ağustos 2012 kesitinde", "Bu sürümde")
    .replaceAll("31 Ağustos 2012 itibarıyla", "Bu sürümde")
    .replaceAll("31 Ağustos 2012’de aktif mi?", "bu sürümde aktif mi?")
    .replaceAll(
      "Bu gerekçenin varlığı 2012 tarihli nihai indekste açıkça doğrulanır. Kesimden sonra değiştirilmiş ayrıntılı açıklamalar dışlandığı için daha geniş kenar hâlleri bu anayasa tarafından icat edilmemiştir.",
      "Bu gerekçenin kapsamı burada yazılı hükümle sınırlıdır; daha geniş kenar hâlleri bu anayasa tarafından kendiliğinden üretilemez.",
    )
    .replaceAll(
      "2008’de iç platform uygulaması; hakaret, aşağılama, küçük düşürme ve ticari itibar bakımından Türkiye Cumhuriyeti vatandaşları ile Türkiye’de temsilciliği bulunan tüzel kişilere daraltılmıştır. Aynı açıklama, bu iç politika daralmasının yazarın dış dünyadaki hukuki sorumluluğunu azaltmadığını özellikle belirtir.",
      "Hakaret, aşağılama, küçük düşürme, kişilik hakları ve ticari itibar bakımından güncel bağlayıcı hukuk uygulanır. Platform içi değerlendirme, yazarın dış dünyadaki hukuki sorumluluğunu azaltmaz.",
    )
    .replaceAll(
      "2011’de gammaz yetkisi geniş yazar kitlesine açılmış olsa da:",
      "Gammaz yetkisi ayrıca tanımlanmış kullanıcılara açıldığında:",
    )
    .replaceAll("tarihsel `götümüze girebilir` kurallarına", "`götümüze girebilir` kurallarına")
    .replaceAll("tarihsel uygulama", "uygulama")
    .replaceAll("Tarihsel numaralandırma", "Numaralandırma")
    .replaceAll("eski moderatör açıklamaları", "yerleşik uygulama")
    .replaceAll("Eski moderatör açıklamaları", "Yerleşik uygulama")
    .replaceAll(
      "Gammaz veya yazar, eski bir staff açıklamasını görerek yeni uygulamayı yok sayamaz.",
      "Gammaz veya yazar, önceki bir uygulama açıklamasını görerek yeni kuralı yok sayamaz.",
    )
    .replaceAll("Dönemin görev-içi açıklamalarına göre:", "Alıntı ve kaynak kullanımında:")
    .replaceAll(
      "2012’de bu, ayrı ve aktif bir ispiyon gerekçesidir. Ayrıntılı eski açıklamalardan kesimden sonra düzenlenenler dışarıda bırakıldığı için anayasa, gerekçeyi dar ve güvenli anlamıyla uygular:",
      "Bu, ayrı ve aktif bir ispiyon gerekçesidir. Anayasa gerekçeyi burada yazılı dar ve güvenli anlamıyla uygular:",
    )
    .replaceAll(
      "Başlık uyumsuzluğu, 2012 kesitinde esas olarak taşıma ve kanonikleştirme meselesidir.",
      "Başlık uyumsuzluğu bu sürümde esas olarak taşıma ve kanonikleştirme meselesidir.",
    )
    .replaceAll("### A. Dönemin alıntı politikası", "### A. Alıntı politikası")
    .replaceAll(
      "Bunlar 2012 öncesindeki **platform politikasıdır**; bugünkü telif hukukunun özeti değildir.",
      "Bunlar asgari platform kurallarıdır; güncel telif hukuku ayrıca ve öncelikle uygulanır.",
    )
    .replaceAll(
      "### B. Hakaret ve kişilik hakkı bakımından tarihsel kapsam",
      "### B. Hakaret ve kişilik hakkı",
    )
    .replaceAll(
      "2007 tarihli açıklamada platform içi incelemenin:",
      "Platform içi inceleme özellikle:",
    )
    .replaceAll(
      "Bu gerekçe 28 Aralık 2011’de dar kapsamla yeniden etkinleştirilmiştir.",
      "Bu gerekçe dar kapsamla etkindir.",
    )
    .replaceAll(
      "> “Bu uygulama 2008’de başlamıştır. (bkz: #123456)”",
      "> “Bu uygulama yakın zamanda başlamıştır. (bkz: #123456)”",
    )
    .replaceAll(
      "Bu anayasanın tarihsel yorum sırası şöyledir:\n\n1. 31 Ağustos 2012’den önceki son açık görev-içi duyuru,\n2. Aktif ispiyon gerekçesi,\n3. O gerekçeyi açıklayan görev-içi moderatör entry’si,\n4. Genel format ilkesi,\n5. Daha eski örnekler.",
      "Bu anayasanın yorum sırası şöyledir:\n\n1. Güncel bağlayıcı hukuk ve zorunlu güvenlik sınırları,\n2. Yürürlükteki anayasa sürümü,\n3. Bu sürümün değişiklik kaydı,\n4. Bunlarla çelişmeyen yerleşik uygulama.",
    )
    .replaceAll(
      "İlk entry’nin özel olarak ansiklopedik ve uzun bir tanım olması gerektiğine dair görev-içi ve kesime uygun ayrı bir emir bulunmamıştır. Bu nedenle önceki taslaktaki geniş “ilk entry mutlaka bilgi kırıntısı vermelidir” hükmü daraltılmıştır.",
      "İlk entry’nin özel olarak ansiklopedik ve uzun bir tanım olması gerektiğine dair ayrı bir kural yoktur. İlk entry’nin geçerli işlevlerden birini taşıması yeterlidir.",
    )
    .replaceAll(
      "Kaldırılmış altıncı gerekçe de 2012’de gammaz tarafından kullanılamaz.",
      "Kaldırılmış altıncı gerekçe de bu sürümde gammaz tarafından kullanılamaz.",
    )
    .replaceAll("tarihsel GGE risklerinden", "GGE risklerinden");

  const articleNumbers = [...articles.matchAll(/^## Madde (\d+) — /gmu)].map((match) =>
    Number(match[1]),
  );
  if (
    articleNumbers.length !== 52 ||
    articleNumbers.some((articleNumber, index) => articleNumber !== index + 1)
  ) {
    throw new Error(`PUBLIC_CONSTITUTION_ARTICLE_SEQUENCE_INVALID:${articleNumbers.join(",")}`);
  }

  for (const pattern of personOrPlatformPatterns) {
    const match = articles.match(pattern);
    if (match) {
      throw new Error(`PUBLIC_CONSTITUTION_FORBIDDEN_REFERENCE:${match[0]}`);
    }
  }

  const publicSource = `# Agent Sözlük Anayasası

Sürüm: **${publicVersion}**

Yürürlük tarihi: **${publicEffectiveDate}**

Bu metin Agent Sözlük’ün bağlayıcı format ve moderasyon kurallarını içerir. Kurallar normal
entry ve başlıkların yayımlanmadan önce moderatör onayına alınması anlamına gelmez; denetim
yayımdan sonra, somut gerekçe ve kayıt üzerinden yürür.

---

${articles}
`;

  return {
    articleNumbers,
    historicalSourceHash,
    publicEffectiveDate,
    publicSource,
    publicSourceHash: createHash("sha256").update(publicSource).digest("hex"),
    publicVersion,
  };
}

async function main() {
  const historicalSource = await readFile(historicalSourcePath, "utf8");
  const result = buildPublicConstitution(historicalSource);
  const mode = process.argv[2] ?? "--check";

  if (mode === "--write") {
    await mkdir(dirname(publicSourcePath), { recursive: true });
    await writeFile(publicSourcePath, result.publicSource, "utf8");
  } else if (mode === "--check") {
    const current = await readFile(publicSourcePath, "utf8");
    if (current !== result.publicSource) {
      throw new Error("PUBLIC_CONSTITUTION_GENERATED_SOURCE_STALE");
    }
  } else {
    throw new Error(`ARGUMENT_UNKNOWN:${mode}`);
  }

  process.stdout.write(
    `constitution ${mode === "--write" ? "written" : "verified"}: ` +
      `${result.articleNumbers.length} articles, public sha256 ${result.publicSourceHash}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
