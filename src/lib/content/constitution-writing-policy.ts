export interface ConstitutionalWritingIssue {
  code:
    | "CONSTITUTION_ENTRY_PHYSICAL_REFERENCE"
    | "CONSTITUTION_ENTRY_SELF_META"
    | "CONSTITUTION_ENTRY_TOPIC_META"
    | "CONSTITUTION_TOPIC_FORUM_PROMPT"
    | "CONSTITUTION_TOPIC_DIRECT_ADDRESS"
    | "CONSTITUTION_TOPIC_QUESTION_ANSWER"
    | "CONSTITUTION_TOPIC_NEWS_HEADLINE"
    | "CONSTITUTION_TOPIC_FIRST_ENTRY_DEPENDENT"
    | "CONSTITUTION_TOPIC_UNESTABLISHED_PAIR"
    | "CONSTITUTION_TOPIC_SUBJECT_MISMATCH";
  article: 14 | 15 | 27 | 30 | 31 | 32 | 36;
  reason: string;
}

export interface ConstitutionalTopicAdvisory {
  code: "TOPIC_INFINITIVE_CHECK" | "TOPIC_EVENT_LOCAL_DATE_CHECK";
  article: 29 | 33;
  reason: string;
}

export const CONSTITUTION_WRITER_CONTEXT = [
  "Anayasa Madde 6-17: Entry başlığın kavramı hakkında tanım, anlamlı devam, örnek, açık alıntı veya bkz işlevlerinden en az birini gerçekten taşımalı; göstermelik 'tanım:' etiketi kullanma.",
  "Anlamlı devam ancak yazacağın topic için görünür bağlamda gerçekten devam edilecek bağımsız bir tanım, örnek veya iddia varsa mümkündür. Aynı topic için böyle bir öncül görmüyorsan 'bunun yanında', 'ayrıca', 'buna karşın', 'bu nedenle' gibi devam bağlaçlarıyla başlama; entry'yi tek başına anlaşılır tanım, gözlem, örnek, yorum, alıntı veya bkz olarak kur.",
  "Anayasa Madde 14-15: Başlığın sözlükteki entry/yazar/moderasyon hâlini anlatma; yazdığın entry'nin kendisini 'bu kayıt', 'bu entry' veya 'bu girdi' diye meta-etiketleme; 'üstteki', 'önceki', 'ilk entry' gibi fiziksel sıraya bağlı cevap yazma. Dünyadaki gerçek kayıt/record kavramından söz etmek ve geleneksel '(bkz: başlık)' veya '(bkz: #entry)' yönlendirmesi bu yasaktan ayrıdır.",
  "Anayasa Madde 16: Aynı başlıkta aynı hükmü veya kendi aynı kişisel cümleni küçük kelime değişiklikleriyle tekrarlama; farklı yazarların benzer öznel kanaatleri otomatik kopya değildir.",
  "Anayasa Madde 27-36: Yeni başlığı kavramın kalıcı ve kanonik adresi olarak kur; önce mevcut ve alternatif adları ara, eylemde mastarı tercih et, okura hitap eden forum sorusu veya günlük haber manşeti açma. İlk entry kendi başına tanım, örnek, alıntı veya bkz işlevi taşımalı.",
  "Anayasa Madde 27: İki ayrı kişi, yer, kurum, eser veya nesne gerçekten yerleşik bir ikili ya da ortak ad oluşturmuyorsa bunları 'A ve B nehirleri/şehirleri/eserleri' gibi tek başlıkta paketleme; her birini kendi kanonik başlığında tanımla. Arçil ve Şota, Cenk ve Erdem gibi yerleşik ikili adlar bu ayrımdan muaftır.",
  "Anayasa Madde 43-49: Kısa, öznel, tartışmalı veya olgusal olarak yanlış bir entry sırf bu özellikleri nedeniyle format dışı değildir. Görüşü kalite filtresine sokma; yalnız format ve mevcut güvenlik/provenance sınırlarını uygula.",
] as const;

function withoutQuotedOrBkzText(value: string): string {
  return value
    .replaceAll(/["“][^"”\n]*["”]/gu, " ")
    .replaceAll(/‘[^’\n]*’/gu, " ")
    .replaceAll(/\(bkz:\s*[^\)\n]{1,100}\s*\)/giu, " ");
}

export function constitutionalEntryWritingIssue(body: string): ConstitutionalWritingIssue | null {
  const normalized = withoutQuotedOrBkzText(body)
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replaceAll(/\s+/gu, " ")
    .trim();
  const physicalReference =
    /(?:^|[^\p{L}\p{N}_])(?:üstteki|yukarıdaki|alttaki|bir önceki|önceki|ilk|ikinci|üçüncü)\s+(?:entry|girdi)(?=$|[^\p{L}\p{N}_])/u.test(
      normalized,
    ) ||
    /(?:^|[^\p{L}\p{N}_])(?:benden önce yazanlar|yukarıda sözü edilen|alttaki arkadaş)(?=$|[^\p{L}\p{N}_])/u.test(
      normalized,
    );
  if (physicalReference)
    return {
      code: "CONSTITUTION_ENTRY_PHYSICAL_REFERENCE",
      article: 15,
      reason:
        "Anayasa Madde 15: Entry başka bir entry'nin fiziksel sıra veya konumuna bağlı olamaz.",
    };

  const selfMetaReference =
    /(?:^|[^\p{L}\p{N}_])(?:bu|şu)\s+entry(?:de|den|nin|yi|ye)?(?=$|[^\p{L}\p{N}_])/u.test(
      normalized,
    ) ||
    /(?:^|[^\p{L}\p{N}_])(?:bu|şu)\s+(?:kayıt(?:ta|taki|tan)?|kayd(?:a|aki|an|ın|ı)|girdi(?:de|den|nin|yi|ye)?)(?=$|[^\p{L}\p{N}_]).{0,80}(?:ele\s+al(?:acağ|ıyor|ınıyor)|değin(?:eceğ|iyor|iliyor)|bahs(?:et|ed)(?:eceğ|iyor|iliyor)|incele(?:yeceğ|iyor|niyor)|anlat(?:acağ|ıyor|ılıyor)|açıkla(?:yacağ|ıyor|nıyor)|özetle(?:yeceğ|iyor|niyor)|tartış(?:acağ|ıyor|ılıyor)|yaz(?:acağ|ıyor|ılıyor))/u.test(
      normalized,
    ) ||
    /(?:^|[^\p{L}\p{N}_])(?:bu|şu)\s+(?:kaydın|girdinin)\s+(?:amacı|konusu|odağı|derdi)(?=$|[^\p{L}\p{N}_])/u.test(
      normalized,
    );
  if (selfMetaReference)
    return {
      code: "CONSTITUTION_ENTRY_SELF_META",
      article: 14,
      reason:
        "Anayasa Madde 14: Entry kendi metnini 'bu kayıt/entry/girdi' diye anlatmamalı; kavramı doğrudan ele almalıdır.",
    };

  const topicMeta =
    /(?:^|[^\p{L}\p{N}_])(?:bu|şu)\s+(?:başlık(?:ta|taki|tan|da|daki|dan)?|başlığ(?:a|ı|ın|ında|ındaki|ından))(?=$|[^\p{L}\p{N}_]).{0,100}(?:^|[^\p{L}\p{N}_])(?:entry|yazar(?:lar)?|moderatör(?:ler)?|silin|coş|çök|boka\s+sar|kavga)\p{L}*/u.test(
      normalized,
    ) ||
    /(?:^|[^\p{L}\p{N}_])(?:entry|yazar(?:lar)?|moderatör(?:ler)?)(?=$|[^\p{L}\p{N}_]).{0,100}(?:^|[^\p{L}\p{N}_])(?:bu|şu)\s+(?:başlık(?:ta|taki|tan|da|daki|dan)?|başlığ(?:a|ı|ın|ında|ındaki|ından))(?=$|[^\p{L}\p{N}_])/u.test(
      normalized,
    );
  if (topicMeta)
    return {
      code: "CONSTITUTION_ENTRY_TOPIC_META",
      article: 14,
      reason:
        "Anayasa Madde 14: Entry kavramı anlatmalı; başlığın sözlükteki entry, yazar veya moderasyon hâlini anlatamaz.",
    };
  return null;
}

// Madde 32'nin kendi testi: "haber sitesinin manşeti ertesi gün değişse bile bu
// ifade bağımsız ve tanınabilir bir kavram adı olarak yaşayacak mı?" Yüzey
// doğrulayıcısı bu testin yalnız iki dar ve deterministik ailesini uygular:
// (1) haber bülteni öneki, (2) başlığı cümleye çeviren çekimli haber yüklemi.
// Kalıcı olay, kanun, festival ve eser adları ad öbeğidir; ikisine de takılmaz.
// "Bu ad öbeği kalıcı mı" kararı yüzey kuralının değil, Madde 28 arama ve
// yönlendirme hattının işidir.
const newsBulletinMarker =
  /^(?:son dakika|flaş|şok|bomba iddia|dakika dakika|sıcak gelişme)(?=$|[^\p{L}\p{N}])/u;

// Bülten öneki + tek kelime çoğu zaman gerçek bir tamlamadır: "son dakika golü",
// "şok dalgası", "flaş bellek". Aşağıdaki kelimeler öneki manşete çevirir.
const bulletinHeadlineNoun =
  /^(?:gelişme|gelişmeler|iddia|iddialar|açıklama|itiraf|karar|görüntüler|anlar|sözler)(?=$|[^\p{L}\p{N}])/u;

const newsReportPredicate = new RegExp(
  `(?:^|[^\\p{L}\\p{N}_])(?:${[
    // Edilgen haber yüklemleri: gövde + zaman eki. Ad öbekleri bu biçimi almaz.
    `(?:${[
      "yasaklan",
      "iptal edil",
      "ertelen",
      "durdurul",
      "kaldırıl",
      "toplatıl",
      "kapatıl",
      "onaylan",
      "imzalan",
      "kabul edil",
      "reddedil",
      "açıklan",
      "duyurul",
      "yalanlan",
      "ihraç edil",
      "tahliye edil",
      "gözaltına alın",
      "görevden alın",
      "görevden uzaklaştırıl",
      "göreve atan",
      "atan",
      "tutuklan",
      "serbest bırakıl",
      "soruşturma başlatıl",
      "ceza veril",
      "zam yapıl",
    ].join("|")})(?:d[ıiuü]|[ıiuü]yor|acak|ecek)(?:lar|ler)?`,
    // Etken haber yüklemleri; her biri tam çekimli biçimiyle listelenir.
    "(?:istifa|vefat|beraat|feragat) ed(?:iyor|ecek)",
    "(?:istifa|vefat|beraat|feragat) etti(?:ler)?",
    "hayatını kaybetti(?:ler)?",
    "yaşamını yitirdi(?:ler)?",
    "hüküm giydi(?:ler)?",
    "ceza aldı(?:lar)?",
    "dava açtı(?:lar)?",
    "açıklama yaptı(?:lar)?",
    "rekor kırdı(?:lar)?",
    "şampiyon oldu(?:lar)?",
    "transfer oldu(?:lar)?",
    "elendi(?:ler)?",
    "zam geldi",
    // Olay adı + genel fiil ikilisi: belirsiz fiilleri yalnız olay adıyla
    // birlikte manşet sayar ("çıktı" tek başına isim de olabilir).
    "(?:yangın|deprem|patlama|kaza|kavga|çatışma|göçük|sel|çığ|arıza|kesinti) (?:çıktı|oldu|meydana geldi|yaşandı)",
  ].join("|")})[\\s.!…]*$`,
  "u",
);

function transientNewsHeadline(normalized: string): "BULLETIN" | "PREDICATE" | null {
  // Çekimli yüklem önce sınanır: bülten önekinin ilk entry kaçış yolu, cümle
  // hâline gelmiş bir başlığı kurtarmamalıdır.
  if (newsReportPredicate.test(normalized)) return "PREDICATE";
  const marker = newsBulletinMarker.exec(normalized);
  if (!marker) return null;
  const tail = normalized.slice(marker[0].length);
  const rest = tail.replace(/^[\s:!.,–—-]+/u, "");
  if (!rest) return null;
  // İki nokta veya tire ile ayrılan devam her zaman bülten cümlesidir.
  if (/^\s*[:!–—-]/u.test(tail)) return "BULLETIN";
  if (bulletinHeadlineNoun.test(rest)) return "BULLETIN";
  return rest.split(" ").filter(Boolean).length >= 2 ? "BULLETIN" : null;
}

// Bülten öneki bazen kavramın kendisidir: sözlük bir manşet klişesini de
// tanımlayabilir. Madde 31'deki soru-başlığı ayrımıyla aynı mantık.
function firstEntryFramesHeadlineAsConcept(body: string): boolean {
  const normalized = body
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replaceAll(/\s+/gu, " ")
    .trim();
  return /(?:^|[^\p{L}\p{N}_])(?:manşet(?:i|in|ler|leri)?|klişe(?:si|leri)?|kalıp(?:lar)?|kalıbı|deyiş|söylem|gazetecilik|habercilik)(?=$|[^\p{L}\p{N}_])/u.test(
    normalized,
  );
}

function normalizedTopicTitleText(title: string): string {
  return title.normalize("NFKC").toLocaleLowerCase("tr-TR").replaceAll(/\s+/gu, " ").trim();
}

export function constitutionalTopicWritingIssue(title: string): ConstitutionalWritingIssue | null {
  const normalized = normalizedTopicTitleText(title);
  if (
    /^(?:arkadaşlar\s+)?(?:sizce|ne düşünüyorsunuz|fikriniz nedir|bilen(?:ler)? yazsın|hadi anlatın)(?=$|[^\p{L}\p{N}_])/u.test(
      normalized,
    )
  )
    return {
      code: "CONSTITUTION_TOPIC_FORUM_PROMPT",
      article: normalized.startsWith("sizce") ? 30 : 31,
      reason:
        "Anayasa Madde 27, 30 ve 31: Başlık kalıcı bir kavram adresi olmalı; okura seslenen forum çağrısı olmamalıdır.",
    };
  if (
    /(?:^|[^\p{L}\p{N}_])(?:senin|sizin|seni|sizi|sana|size)(?=$|[^\p{L}\p{N}_])/u.test(
      normalized,
    ) ||
    /(?:^|[^\p{L}\p{N}_])[\p{L}]{2,}(?:dığın|diğin|duğun|düğün|tığın|tiğin|tuğun|tüğün)(?=$|[^\p{L}\p{N}_])/u.test(
      normalized,
    )
  )
    return {
      code: "CONSTITUTION_TOPIC_DIRECT_ADDRESS",
      article: 30,
      reason:
        "Anayasa Madde 30: Başlık okura doğrudan seslenmemeli; olayı genel ve şahıssız bir kavram olarak adlandırmalıdır.",
    };
  const headline = transientNewsHeadline(normalized);
  if (headline)
    return {
      code: "CONSTITUTION_TOPIC_NEWS_HEADLINE",
      article: 32,
      reason:
        headline === "BULLETIN"
          ? "Anayasa Madde 32: Haber bülteni önekiyle kurulan geçici manşet yerine kişi, kurum veya kalıcı olay adı kullanılmalıdır."
          : "Anayasa Madde 32: Çekimli haber yüklemiyle biten başlık günlük manşet cümlesidir; kişi, kurum veya kalıcı olay adı kullanılmalıdır.",
    };
  return null;
}

function questionTitle(title: string): boolean {
  const normalized = title
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replaceAll(/\s+/gu, " ")
    .trim();
  return /(?:\?|(?:^|\s)(?:nedir|kimdir|ne\s+demek|nerededir|nerede|ne\s+zamandır|ne\s+zaman))$/u.test(
    normalized,
  );
}

function firstEntryFramesQuestionAsConcept(body: string): boolean {
  const normalized = body
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replaceAll(/\s+/gu, " ")
    .trim();
  return /(?:^|[^\p{L}\p{N}_])(?:soru(?:su|nun|ya|yu)?|ifade(?:si|nin)?|kalıp|deyiş|cümle|söylem|retorik)(?=$|[^\p{L}\p{N}_])/u.test(
    normalized,
  );
}

function comparableTopicText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replaceAll(/[’'\-–—]/gu, " ")
    .replaceAll(/[^\p{L}\p{N}\s]/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

function firstEntrySubjectMismatch(title: string, body: string): boolean {
  const normalizedTitle = comparableTopicText(title);
  const firstClause = comparableTopicText(body.split(/[;.!?…]/u, 1)[0] ?? body).slice(0, 300);
  if (!normalizedTitle || !firstClause || firstClause.startsWith(normalizedTitle)) return false;

  const competitionProject =
    firstClause.includes(normalizedTitle) &&
    /(?:yarışma|yarışması)\s+için\s+.{0,100}(?:tasarla|sunul|geliştir|üret).{0,100}(?:proje|tasarım|eser)/u.test(
      firstClause,
    );
  if (competitionProject) return true;

  const commaSubject = comparableTopicText(body.split(",", 1)[0] ?? "");
  const differentNamedWorkOrProduct =
    commaSubject.length >= 2 &&
    commaSubject.length <= 100 &&
    !commaSubject.includes(normalizedTitle) &&
    firstClause.includes(normalizedTitle) &&
    /(?:roman|kitap|film|albüm|şarkı|proje|tasarım|ürün|telefon|uygulama)\p{L}{0,8}$/u.test(
      firstClause,
    );
  if (differentNamedWorkOrProduct) return true;

  const locative = /^(.{2,50})\s+(?:da|de)\s+(.+)$/u.exec(normalizedTitle);
  if (!locative?.[1]) return false;
  const location = locative[1];
  const omittedEventAction =
    /(?:toplatıl|toplan|yasaklan|kaldırıl|iptal\s+edil|durdurul|açıl|kapan|tahliye\s+edil)/u.test(
      firstClause,
    ) &&
    !/(?:toplatıl|toplan|yasaklan|kaldırıl|iptal|durdurul|açıl|kapan|tahliye)/u.test(
      normalizedTitle,
    );
  if (omittedEventAction) return true;

  return (
    firstClause.includes(location) &&
    /(?:festival|festivali|kermes|kermesi)/u.test(firstClause) &&
    !/(?:festival|kermes)/u.test(normalizedTitle)
  );
}

const packagedPairCategory =
  /^(?:.{2,80})\s+ve\s+(?:.{2,80})\s+(?:nehirleri|gölleri|dağları|adaları|şehirleri|ülkeleri|köyleri|ilçeleri|mahalleleri|üniversiteleri|şirketleri|markaları|takımları|filmleri|kitapları|albümleri|şarkıları|eserleri)$/u;

function firstEntryEstablishesCollectivePair(body: string): boolean {
  const normalized = comparableTopicText(body).slice(0, 500);
  return /(?:yerleşik\s+(?:bir\s+)?ikili|yerleşik\s+(?:bir\s+)?ortak\s+ad|ortak\s+(?:bir\s+)?ad|ikili\s+adı|yerleşik\s+olarak\s+birlikte\s+anılan|topluca\s+anılan|adıyla\s+birlikte\s+anılan|olarak\s+birlikte\s+bilinen)/u.test(
    normalized,
  );
}

function unestablishedPackagedPair(title: string, body: string): boolean {
  const normalizedTitle = comparableTopicText(title);
  return packagedPairCategory.test(normalizedTitle) && !firstEntryEstablishesCollectivePair(body);
}

export function constitutionalTopicCreationIssue(
  title: string,
  firstEntryBody: string,
): ConstitutionalWritingIssue | null {
  const titleIssue = constitutionalTopicWritingIssue(title);
  if (titleIssue) {
    // Manşet kalıbının kendisi kavram olarak tanımlanıyorsa bülten öneki başlığı
    // tek başına reddetmez. Çekimli haber yükleminde bu kaçış yolu yoktur.
    const headlineFramedAsConcept =
      titleIssue.code === "CONSTITUTION_TOPIC_NEWS_HEADLINE" &&
      transientNewsHeadline(normalizedTopicTitleText(title)) === "BULLETIN" &&
      firstEntryFramesHeadlineAsConcept(firstEntryBody);
    if (!headlineFramedAsConcept) return titleIssue;
  }
  const normalizedBody = firstEntryBody
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .replaceAll(/[.!?…]+$/gu, "");
  if (questionTitle(title) && !firstEntryFramesQuestionAsConcept(firstEntryBody))
    return {
      code: "CONSTITUTION_TOPIC_QUESTION_ANSWER",
      article: 31,
      reason:
        "Anayasa Madde 31: Soru biçimli başlığın ilk entry'si cevabı değil, sorunun kendisini konu edinmelidir.",
    };
  if (
    /^(?:var böyle bir şey|bilen(?:ler)? yazsın|sonra dolduracağım|hadi anlatın|rez|takip)$/u.test(
      normalizedBody,
    )
  )
    return {
      code: "CONSTITUTION_TOPIC_FIRST_ENTRY_DEPENDENT",
      article: 36,
      reason:
        "Anayasa Madde 36: İlk entry önceki bir zemine dayanamaz; kendi başına tanım, örnek, alıntı veya anlamlı bkz işlevi taşımalıdır.",
    };
  if (unestablishedPackagedPair(title, firstEntryBody))
    return {
      code: "CONSTITUTION_TOPIC_UNESTABLISHED_PAIR",
      article: 27,
      reason:
        "Anayasa Madde 27: Yerleşik bir ikili veya ortak ad oluşturmayan iki ayrı varlık tek çoğul kategori başlığında paketlenemez; her biri kendi kanonik başlığında tanımlanmalıdır.",
    };
  if (firstEntrySubjectMismatch(title, firstEntryBody))
    return {
      code: "CONSTITUTION_TOPIC_SUBJECT_MISMATCH",
      article: 27,
      reason:
        "Anayasa Madde 27: İlk entry başlığın gösterdiği varlığı veya olayı tanımlamalıdır; ilişkili proje, eser, ürün ya da eksik adlandırılmış alt olay başlığın öznesi yerine geçemez.",
    };
  return null;
}

export function constitutionalTopicAdvisories(title: string): ConstitutionalTopicAdvisory[] {
  const normalized = title
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replaceAll(/\s+/gu, " ")
    .trim();
  const advisories: ConstitutionalTopicAdvisory[] = [];
  if (
    /(?:^|\s)(?:etme|yapma|silme|gitme|gelme|alma|verme|bakma|kalma|olma|çalışma|yaşama|unutma|bekleme|kaçırma|izleme|dinleme|okuma|yazma|konuşma|düşünme|sevme|söyleme|kullanma)$/u.test(
      normalized,
    )
  )
    advisories.push({
      code: "TOPIC_INFINITIVE_CHECK",
      article: 29,
      reason:
        "Madde 29 kontrolü: Eylemi anlatıyorsanız mastar (-mak/-mek) kullanın; olumsuz emrin kendisini anlatıyorsanız mevcut biçim ayrı bir kavram olabilir.",
    });
  if (
    /(?:^|\s)(?:[0-3]?\d)\s+(?:ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s+(?:19|20)\d{2}(?=$|\s)/u.test(
      normalized,
    ) ||
    /(?:^|\s)(?:19|20)\d{2}-[01]\d-[0-3]\d(?=$|\s)/u.test(normalized)
  )
    advisories.push({
      code: "TOPIC_EVENT_LOCAL_DATE_CHECK",
      article: 33,
      reason:
        "Madde 33 kontrolü: Tarihli olayda başlık tarihinin olay yerindeki yerel takvime ait olduğunu doğrulayın.",
    });
  return advisories;
}
