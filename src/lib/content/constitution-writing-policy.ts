export interface ConstitutionalWritingIssue {
  code:
    | "CONSTITUTION_ENTRY_PHYSICAL_REFERENCE"
    | "CONSTITUTION_ENTRY_SELF_META"
    | "CONSTITUTION_ENTRY_TOPIC_META"
    | "CONSTITUTION_TOPIC_FORUM_PROMPT"
    | "CONSTITUTION_TOPIC_DIRECT_ADDRESS"
    | "CONSTITUTION_TOPIC_QUESTION_ANSWER"
    | "CONSTITUTION_TOPIC_NEWS_HEADLINE"
    | "CONSTITUTION_TOPIC_TRANSIENT_INCIDENT"
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
  "Anayasa Madde 7: Tanımın nesnel olması, akademik olması, uzun olması, kaynak içermesi veya `-dır` ile bitmesi ZORUNLU DEĞİLDİR. Anayasanın kendi örnekleri geçerli tanımdır: `güzel`, `rezil`, `sıkıcı bir iş`, `olmaz olası`, `insana böyle şey olur mu dedirten olay`. Kavrama yönelmiş olmak şartıyla kendi sesinle, kısa, öznel, konuşma diliyle yazabilirsin; ansiklopedi maddesi kurmak zorunda değilsin. Ölçüt kelime kalıbı değil, tanımlanan nesnedir.",
  "Anayasa Madde 30-31 BAŞLIK hakkındadır, entry gövdesi hakkında değil. Gövdede soru cümlesi kurmak, kendi deneyimini veya kanaatini yazmak yasak değildir; anayasa cetvelinde `Çocukluğumdan beri severim.` ve `Dün pazardan aldım.` legal sayılır. Ölçüt yine işlevdir: `Neydi bu ya?` hatalıdır çünkü soru olduğu için değil, hiçbir tanım/devam/örnek/alıntı/bkz işlevi taşımadığı için.",
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
/*
  Diakritiksiz yazım ("flas", "sok", "sicak gelisme") aynı bülten önekidir; kural
  bunu ancak katlanmış bir kopya üzerinde görebilir. Katlama yalnız bülten öneki
  taramasında ve önekin kuyruğunda kullanılır, başlığın kalanına dokunmaz.
*/
const turkishDiacriticFolding: Record<string, string> = {
  â: "a",
  î: "i",
  û: "u",
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
};

function foldTurkishDiacritics(value: string): string {
  return value.replaceAll(
    /[âîûçğıöşü]/gu,
    (character) => turkishDiacriticFolding[character] ?? character,
  );
}

/*
  Bülten önekleri. `folded` alanı diakritiksiz yazımın karşılığıdır; `null` ise o
  önek yalnız tam yazımıyla aranır. `şok` katlandığında `sok` olur ve bu gerçek
  bir Türkçe fiil biçimidir ("sok bakalım"); katlanmış geçişe alınırsa sıradan
  başlıkları manşet sayardı. Kaybedilen tek şey "sok: ..." yazımıdır.
*/
const bulletinMarkers = [
  { key: "son dakika", direct: "son dakika", folded: "son dakika" },
  { key: "flaş", direct: "flaş", folded: "flas" },
  { key: "şok", direct: "şok", folded: null },
  { key: "bomba iddia", direct: "bomba iddia", folded: "bomba iddia" },
  { key: "dakika dakika", direct: "dakika dakika", folded: "dakika dakika" },
  { key: "sıcak gelişme", direct: "sıcak gelişme", folded: "sicak gelisme" },
] as const;

function startsWithSeparateWord(value: string, word: string): boolean {
  if (!value.startsWith(word)) return false;
  const next = value.slice(word.length, word.length + 1);
  return next === "" || !/[\p{L}\p{N}]/u.test(next);
}

function bulletinPrefix(normalized: string): { key: string; tail: string } | null {
  const folded = foldTurkishDiacritics(normalized);
  for (const marker of bulletinMarkers) {
    if (startsWithSeparateWord(normalized, marker.direct))
      return { key: marker.key, tail: normalized.slice(marker.direct.length) };
    if (marker.folded && startsWithSeparateWord(folded, marker.folded))
      return { key: marker.key, tail: folded.slice(marker.folded.length) };
  }
  return null;
}

// Bülten öneki + tek kelime çoğu zaman gerçek bir tamlamadır: "son dakika golü",
// "şok dalgası", "flaş bellek". Aşağıdaki kelimeler öneki manşete çevirir. Liste
// diakritiksiz yazılır; kuyruk her zaman katlanmış biçimiyle sınanır.
const bulletinHeadlineNoun =
  /^(?:gelisme|iddia|aciklama|itiraf|karar|goruntuler|anlar|sozler|deprem|yangin|patlama|kaza|kavga|catisma|gocuk|sel|cig|firtina|ariza|kesinti|saldiri|zam|istifa|transfer|olum|gozalti|tutuklama|operasyon)(?:ler|lar)?(?=$|[^\p{L}\p{N}])/u;

/*
  Bülten sözcüğü bazen sabit bir terkibin ilk parçasıdır ve orada manşet değil,
  kavramın kendi adıdır: "flaş bellek veri kurtarma", "şok dalgası ölçümü". Kuyruk
  kelime sayısına bakan kural bunları manşet sanıyordu. Yüzey kuralı "bu ad öbeği
  yerleşik bir terkip mi" sorusunu ancak açık bir sözlükle yanıtlayabilir; sözlükte
  olmayan terkibi kalıcı sayma kararı Madde 28 arama hattına aittir.
*/
const bulletinLexicalCompound: Record<string, RegExp> = {
  şok: /^(?:dalga|terapi|magaza|emici|absorber|sogutma|dondurma|tedavi|jenerator|deneyi)/u,
  flaş: /^(?:bellek|disk|isik|lamba|fotograf|kart|surucu)/u,
  "son dakika": /^(?:gol|sayi|asist|penalti)/u,
};

// Bağlaçla devam eden kuyruk manşet cümlesi değil, iki öğeli ad öbeğidir:
// "şok ve titreşim analizi".
const bulletinPhraseConjunction = /^(?:ve|ile|veya|ya da)(?=$|[^\p{L}\p{N}])/u;

/*
  Çekimli haber yükleminin ek grubu. Naif bir ek kuralı değildir: gövdeler aşağıdaki
  iki sözlükte tek tek sayılıdır, bu grup yalnız o gövdelerin bitmiş (-dı), sürüyor
  (-ıyor), gelecek (-acak), duyulan geçmiş (-mış) ve olumsuz çekimlerini kapsar.
  Mastar (-mak/-mek) ve sıfat-fiil (-an/-en) bilerek dışarıdadır; "istifa etmek" ve
  "görevden alınan bakan" kalıcı kavram adlarıdır. `m` ile başlayan olumsuz kuyruklar
  mastarı yutmaz, çünkü `m`den sonra ya `[ıiuü]` ya `[ae]d`, `[ae]m`, `[ae]y` gelir.
*/
const finiteNewsTense =
  "(?:d[ıiuü]|t[ıiuü]|[ıiuü]yor|acak|ecek|m[ıiuü]ş|m[ae]d[ıiuü]|m[ıiuü]yor|m[ae]y[ae]c[ae]k|m[ae]m[ıiuü]ş)(?:lar|ler)?";

/*
  Madde 32 fiil sözlüğü. `harm` alanı fiilin GÖVDE güvenlik kapısına da girip
  girmediğini söyler; başlık kapısı ikisini de kullanır.

  - "PERSON_STATUS": öznesi bir kişi olan, o kişinin hukuki, mesleki veya hayati
    durumundaki değişimi bildiren yüklem. Kaynaksız yazıldığında zarar doğrudan ve
    kişiseldir — `seriousCrimeMarkers` listesinin koruduğu zarar sınıfının aynısı.
  - "GENERIC": kurumsal ya da idari yüklem. Başlıkta manşet sayılmasının nedeni
    fiilin kendisi değil, BAŞLIĞIN TAMAMININ o fiille bitmesidir; bu yapısal işaret
    gövde içinde yoktur ve aynı fiil orada sıradan Türkçe düzyazıdır ("bu uygulama
    2019'da kapatıldı", "oturum kapatıldı"). Gövdedeki güncellik zaten zaman
    zarflarıyla ölçülür: "uygulama bugün kapatıldı" kapıya `bugün` ile takılır.

  Ölçüm: sözlüğün tamamı gövde kapısına verildiğinde bu depodaki 7.698 metin
  sabitinden 97'si `false → true` dönüyor ve büyük çoğunluğu "oturum kapatıldı",
  "kabul edildi", "iptal edildi" gibi sıradan cümleler. PERSON_STATUS alt kümesiyle
  bu sayı 12'ye iniyor ve hepsi gerçekten kişi durumu bildiren cümleler.
*/
type NewsVerbHarm = "PERSON_STATUS" | "GENERIC";

// Edilgen haber yüklemleri: gövde + zaman eki. Ad öbekleri bu biçimi almaz.
const passiveNewsVerbStems: ReadonlyArray<readonly [string, NewsVerbHarm]> = [
  ["yasaklan", "GENERIC"],
  ["iptal edil", "GENERIC"],
  ["ertelen", "GENERIC"],
  ["durdurul", "GENERIC"],
  ["kaldırıl", "GENERIC"],
  ["toplatıl", "GENERIC"],
  ["kapatıl", "GENERIC"],
  ["onaylan", "GENERIC"],
  ["imzalan", "GENERIC"],
  ["kabul edil", "GENERIC"],
  ["reddedil", "GENERIC"],
  ["açıklan", "GENERIC"],
  ["duyurul", "GENERIC"],
  ["yalanlan", "GENERIC"],
  ["ihraç edil", "PERSON_STATUS"],
  ["tahliye edil", "PERSON_STATUS"],
  ["gözaltına alın", "PERSON_STATUS"],
  ["görevden alın", "PERSON_STATUS"],
  ["görevden uzaklaştırıl", "PERSON_STATUS"],
  ["göreve atan", "PERSON_STATUS"],
  // Çıplak `atan` gövdede "atanmış bir değer" gibi kullanımlara da açıktır;
  // kişi ataması `göreve atan` ile ayrıca sayılıdır.
  ["atan", "GENERIC"],
  ["tutuklan", "PERSON_STATUS"],
  ["serbest bırakıl", "PERSON_STATUS"],
  ["soruşturma başlatıl", "PERSON_STATUS"],
  ["ceza veril", "PERSON_STATUS"],
  ["zam yapıl", "GENERIC"],
];

// Etken haber yüklemleri; her biri gövdesiyle listelenir. `e[td]` ünsüz
// yumuşamasını karşılar: "etti" ~ "ediyor". Son satır olay adı + genel fiil
// ikilisidir: belirsiz fiilleri yalnız olay adıyla birlikte manşet sayar.
const activeNewsVerbStems: ReadonlyArray<readonly [string, NewsVerbHarm]> = [
  ["(?:istifa|vefat|beraat|feragat) e[td]", "PERSON_STATUS"],
  ["hayatını kaybe[td]", "PERSON_STATUS"],
  ["yaşamını yitir", "PERSON_STATUS"],
  ["hüküm giy", "PERSON_STATUS"],
  ["ceza al", "PERSON_STATUS"],
  ["dava aç", "PERSON_STATUS"],
  ["açıklama yap", "GENERIC"],
  ["rekor kır", "GENERIC"],
  ["şampiyon ol", "GENERIC"],
  ["transfer ol", "GENERIC"],
  ["elen", "GENERIC"],
  ["zam gel", "GENERIC"],
  [
    "(?:yangın|deprem|patlama|kaza|kavga|çatışma|göçük|sel|çığ|arıza|kesinti) (?:çık|ol|meydana gel|yaşan)",
    "GENERIC",
  ],
];

function newsPredicateSource(harm: NewsVerbHarm | "ALL"): string {
  const verbs = [...passiveNewsVerbStems, ...activeNewsVerbStems]
    .filter(([, verbHarm]) => harm === "ALL" || verbHarm === harm)
    .map(([stem]) => stem)
    .join("|");
  return `(?:^|[^\\p{L}\\p{N}_])(?:${verbs})${finiteNewsTense}`;
}

// Başlık kapısı: yüklem başlığın sonunda olmalı, yoksa başlık cümle değildir.
const newsReportPredicate = new RegExp(`${newsPredicateSource("ALL")}[\\s.!…]*$`, "u");

// Gövde kapısı: aynı sözlüğün kişi durumu alt kümesi, cümle içinde serbest
// konumda. `action-policy.ts` buradan okur; iki kapı ayrı liste tutarsa
// "Bakan istifa etti." başlıkta manşet sayılıp gövdede hiçbir işaretçiye
// takılmıyor ve USER_ENTRY provenance ile yayımlanıyordu.
const personStatusNewsPredicate = new RegExp(
  `${newsPredicateSource("PERSON_STATUS")}(?![\\p{L}])`,
  "u",
);

/**
 * Madde 32 fiil sözlüğünün kişi durumu alt kümesi, cümle içi arama için. Başlık
 * kapısıyla tek kaynaktan beslenir; bkz. `NewsVerbHarm` yorumu.
 */
export function containsPersonStatusNewsPredicate(text: string): boolean {
  return personStatusNewsPredicate.test(text.normalize("NFKC").toLocaleLowerCase("tr-TR"));
}

function transientNewsHeadline(normalized: string): "BULLETIN" | "PREDICATE" | null {
  // Çekimli yüklem önce sınanır: bülten önekinin ilk entry kaçış yolu, cümle
  // hâline gelmiş bir başlığı kurtarmamalıdır.
  if (newsReportPredicate.test(normalized)) return "PREDICATE";
  const prefix = bulletinPrefix(normalized);
  if (!prefix) return null;
  const rest = foldTurkishDiacritics(prefix.tail.replace(/^[\s:!.,–—-]+/u, ""));
  if (!rest) return null;
  // Sabit terkip veya bağlaçlı ad öbeği: bülten sözcüğü manşet kurmuyor.
  if (bulletinLexicalCompound[prefix.key]?.test(rest)) return null;
  if (bulletinPhraseConjunction.test(rest)) return null;
  // İki nokta veya tire ile ayrılan devam her zaman bülten cümlesidir.
  if (/^\s*[:!–—-]/u.test(prefix.tail)) return "BULLETIN";
  if (bulletinHeadlineNoun.test(rest)) return "BULLETIN";
  return rest.split(" ").filter(Boolean).length >= 2 ? "BULLETIN" : null;
}

/*
  Madde 32'nin ikinci ailesi: çekimli yüklem taşımayan, ad öbeği biçiminde manşet.

  Ölçüm (27 Ağu, üretimden 531 başlık / 7 gün): çekimli yüklem kuralı altı günde
  BİR KEZ ateşlememişti, çünkü üretimdeki başlıklar cümle değil ad öbeği:
  `Tahtakale'de leylek ölümleri`, `Çayırhan maden kazası`, `TEVA soruşturması`.

  Ayırt edici işaretin ne OLMADIĞI da ölçüldü. İlk aday bulunma hâli ekiydi
  (`X'da <şey>`); tek başına alındığında 531 başlığın 28'ini yakalıyor ama
  yarısı meşru kavram adı: `Türkiye'de elektrikli araç şarj ağı`,
  `Firefox'ta yerleşik VPN`, `Çin'de robotlaşma`, `YouTube'da büyümek`. Bunlar
  ertesi gün manşet değişse de yaşar; reddedilmeleri Madde 27'ye aykırı olurdu.
  Ayıran şey yer eki değil, BAŞLIĞIN SON ADI: `ölümleri` bir vakadır, `şarj ağı`
  bir şeydir. Kural bu yüzden yalnız iyelikli vaka adına bakar; bulunma hâli
  yalnızca önerilecek adresi okumak için kullanılır.

  Anayasanın kendi koruduğu olay adları bu listeye ALINMAZ: Madde 32 `dava`yı,
  Madde 33 `deprem / seçim / maç / konser`i açıkça meşru başlık sayıyor.
*/
const protectedEventHead =
  /(?:davası|duruşması|depremi|seçimi|seçimleri|maçı|konseri|festivali|krizi|yasası|savaşı|devrimi|antlaşması)$/u;

/*
  Geçici vaka adları. Ortak özellikleri: tekil, tarihli, ertesi gün başka bir
  vakayla yer değiştiren olaylar. Hepsi iyelik ekli, yani önlerinde mutlaka bir
  niteleyen var (`Hopa seli`, `Çayırhan maden kazası`) — tek kelimelik başlık bu
  biçimi almaz, kural zaten en az iki kelime arar.

  `erişim engeli` listeye tek parça olarak girer: çıplak `engeli` `görme engeli`
  gibi kalıcı kavramları da yutardı. Üretimde yedi günde DOKUZ ayrı `<kişi veya
  kurum>'(n)a erişim engeli` başlığı açılmıştı; ailenin en kalabalığı bu.

  İŞÇİ EYLEMİ AİLESİ BİLEREK DIŞARIDA (`direnişi`, `eylemi`, `grevi`, `mitingi`,
  `yürüyüşü`, `protestosu`, `dayanışması`). Bağımsız bir hakem modeli 27 aday
  başlığı kör değerlendirdiğinde dokuz itirazının beşi bu aileydi: adlı bir
  şirkette süren direniş, manşet ertesi gün değişse de tanınabilir bir ad olarak
  yaşıyor. Madde 32'nin çare listesi zaten `olay`ı meşru başlık sayıyor; adlandırılmış
  bir emek mücadelesi o listeye giriyor. Kuralın kapsamı bu yüzden dar tutuldu:
  tartışmalı aileyi içeri almaktansa gerçek ihlallerin bir kısmını kaçırmak yeğdir.

  ADLANDIRILMIŞ DOĞAL AFET AİLESİ DE DIŞARIDA (`kazası`, `seli`, `çığı`, `fırtınası`,
  `göçüğü`). `Soma maden kazası` ve `1999 Gölcük depremi` yıllar sonra da tanınabilir
  kavram adlarıdır ve `962f9e9` bu ayrımı zaten kurmuştu: o commit `Orta Afrika
  Cumhuriyeti altın madeni göçüğü`nü açıkça kalıcı olay adı sayıp test tablosuna
  yazmış ve ilkeyi koymuştu — "recall traded for protecting names". Aynı içtihat
  burada da geçerli; afet adını yüzeyden tekil vakadan ayırmanın yolu yok.
*/
const transientIncidentHead =
  /(?:erişim engeli|çarpması|yangını|patlaması|arızası|kesintisi|ölümleri|ölümü|yaralanması|boğulması|saldırısı|çatışması|soruşturması|gözaltısı|tutuklanması|istifası|iflası|rekoru)$/u;

function transientIncidentTitle(normalized: string): boolean {
  if (normalized.split(" ").filter(Boolean).length < 2) return false;
  if (protectedEventHead.test(normalized)) return false;
  return transientIncidentHead.test(normalized);
}

/*
  Madde 32 yalnız "başlık açma" demiyor, nereye yazılacağını da söylüyor: ilgili
  kişi, kurum, ülke, olay, dava, takım veya eser başlığı. Bulunma hâliyle kurulan
  vaka başlığı o adresi zaten kendi içinde taşıyor — `Tahtakale'de leylek
  ölümleri` için adres `Tahtakale`. Reddi adressiz bırakmamak önemli: ölçüme göre
  `canonicalOverride` altı günde sıfır kez kullanılmış, çünkü ajana hiç somut
  alternatif çıkmıyor.

  Adres ham başlıktan okunur, normalleştirilmişten değil: özel adı sıradan
  kelimeden ayıran şey büyük harf ve Türkçede özel ada gelen hâl eki apostrofla
  yazılır. Apostrof şartı olmadan `Meta AI` → `Me`+`ta`, `Toyota RAV4` →
  `Toyo`+`ta` diye bölünüyordu.
*/
const locativeProperNounAddress =
  /^(\p{Lu}[\p{L}\p{N}.]*(?:\s+\p{Lu}[\p{L}\p{N}.]*){0,3})['’](?:d[ae]|t[ae])\s+\S/u;

function suggestedCanonicalAddress(rawTitle: string): string | null {
  return locativeProperNounAddress.exec(rawTitle.normalize("NFKC").trim())?.[1] ?? null;
}

/*
  Vaka adı bazen kalıcı olay adının kendisidir: `Soma maden kazası` yıllar sonra
  da tanınabilir bir kavram adıdır. Yüzey kuralı tekil vakayı yerleşik olandan
  ayıramaz; ayıran şey ilk entry'nin o olayı YERLEŞİK olarak konumlandırmasıdır.
  Bülten önekindeki kaçış yolunun aynısı, aynı gerekçeyle: karar yüzey kuralının
  değil, Madde 6-17 içerik değerlendirmesinin işi.
*/
const establishedIncidentFraming =
  /(?:olarak\s+anıl|adıyla\s+anıl|adıyla\s+bilin|olarak\s+bilin|tarihe\s+geç|yıl\s+dönümü|yıldönümü|dönüm\s+noktası|hafızasına\s+yerleş|simge(?:si|leşmiş)|literatüre\s+geç)/u;

function firstEntryFramesIncidentAsEstablished(body: string): boolean {
  return establishedIncidentFraming.test(
    body.normalize("NFKC").toLocaleLowerCase("tr-TR").replaceAll(/\s+/gu, " "),
  );
}

/*
  Bülten öneki bazen kavramın kendisidir: sözlük bir manşet klişesini de
  tanımlayabilir. Ama istisnayı açan şey entry'nin herhangi bir yerinde geçen
  "söylem" ya da "manşet" sözcüğü değil, entry'nin YÜKLEMİNİN o dilsel kategori
  olmasıdır. Eski kural gövde çapında arıyordu ve gerçek bir manşet başlığı,
  gövdesinde tesadüfen "manşet" geçtiği için fail-open geçiyordu.

  Yüklem iki biçimde kurulur: bildirme ekiyle ("manşet kalıbıdır") ya da ad
  cümlesinin son sözcüğü olarak ("... bir manşet kalıbı."). İkisi de yüzeyden
  görülebilir; "bu entry gerçekten kalıbı mı tanımlıyor" sorusunun geri kalanı
  yüzey kuralının değil, Madde 6-17 içerik değerlendirmesinin işidir.
*/
const metalinguisticCategoryNoun = "(?:manşet|klişe|kalıp|kalıb|deyiş|deyim|söylem|tabir)";

const metalinguisticCopulaPredicate = new RegExp(
  `(?:^|[^\\p{L}\\p{N}_])${metalinguisticCategoryNoun}(?:ler|lar)?(?:i|ı|u|ü|si|sı|su|sü)?[dt][ıiuü]r(?=$|[^\\p{L}\\p{N}_])`,
  "u",
);

const metalinguisticNominalHead = new RegExp(
  `(?:^|[^\\p{L}\\p{N}_])${metalinguisticCategoryNoun}\\p{L}{0,6}$`,
  "u",
);

function firstEntryFramesHeadlineAsConcept(body: string): boolean {
  const normalized = body
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replaceAll(/\s+/gu, " ")
    .trim();
  if (metalinguisticCopulaPredicate.test(normalized)) return true;
  const firstSentence = (normalized.split(/(?<=[.!?…])\s+/u, 1)[0] ?? normalized).replace(
    /[.!?…\s]+$/u,
    "",
  );
  return metalinguisticNominalHead.test(firstSentence);
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
  if (transientIncidentTitle(normalized)) {
    const address = suggestedCanonicalAddress(title);
    return {
      code: "CONSTITUTION_TOPIC_TRANSIENT_INCIDENT",
      article: 32,
      reason: address
        ? `Anayasa Madde 32: Tekil bir vakayı adlandıran başlık, manşet ertesi gün değiştiğinde kavram adı olarak yaşamaz. Katkıyı "${address}" başlığı altına yazın.`
        : "Anayasa Madde 32: Tekil bir vakayı adlandıran başlık, manşet ertesi gün değiştiğinde kavram adı olarak yaşamaz; katkı ilgili kişi, kurum, ülke veya kalıcı olay başlığına yazılmalıdır.",
    };
  }
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
    // Yerleşik olay adı kaçışı yalnız vaka ailesine açıktır; bülten öneki ve
    // çekimli yüklem kendi kaçış yollarını yukarıda tüketti.
    const incidentFramedAsEstablished =
      titleIssue.code === "CONSTITUTION_TOPIC_TRANSIENT_INCIDENT" &&
      firstEntryFramesIncidentAsEstablished(firstEntryBody);
    if (!headlineFramedAsConcept && !incidentFramedAsEstablished) return titleIssue;
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
