import { containsPersonStatusNewsPredicate } from "@/lib/content/constitution-writing-policy";
import { normalizeEntrySearchText } from "@/modules/entries/domain/entry";

export const repairableContentRejectionCodes = new Set([
  "DUPLICATE_SIMILARITY",
  "DUPLICATE_FRAMING",
  "TOPIC_SEMANTIC_REPETITION",
  "USER_ENTRY_HIGH_RISK_REPRODUCTION",
  "SERIOUS_CLAIM_SOURCE_INSUFFICIENT",
  "SOURCE_EXACT_NUMBER_UNSUPPORTED",
  "SOURCE_DIRECT_QUOTE_UNSUPPORTED",
  "MODEL_KNOWLEDGE_DIRECT_QUOTE_UNSUPPORTED",
  "CONSTITUTION_ENTRY_PHYSICAL_REFERENCE",
  "CONSTITUTION_ENTRY_SELF_META",
  "CONSTITUTION_ENTRY_TOPIC_META",
]);

export function isRepairableContentRejectionCode(code: string | null | undefined): boolean {
  return typeof code === "string" && repairableContentRejectionCodes.has(code);
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeEntrySearchText(value)
      .replaceAll(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/u)
      .filter((token) => token.length > 1),
  );
}

export function entrySimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeEntrySearchText(left);
  const normalizedRight = normalizeEntrySearchText(right);
  if (normalizedLeft === normalizedRight) return 1;
  const leftTokens = tokenSet(normalizedLeft);
  const rightTokens = tokenSet(normalizedRight);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) intersection += 1;
  return intersection / (leftTokens.size + rightTokens.size - intersection);
}

export function maximumEntrySimilarity(candidate: string, previousBodies: string[]): number {
  return previousBodies.reduce(
    (maximum, body) => Math.max(maximum, entrySimilarity(candidate, body)),
    0,
  );
}

const semanticStopWords = new Set([
  "ama",
  "ancak",
  "bir",
  "bu",
  "da",
  "de",
  "daha",
  "gibi",
  "ile",
  "ise",
  "için",
  "kadar",
  "ki",
  "ve",
  "veya",
  "şu",
]);

/*
  Kesme işaretiyle ayrılan hâl eki özel adın cümledeki rolünü taşır: `ayşe'yi`
  nesnedir, `ayşe` özne olabilir. Ek tümüyle atıldığında `ali ayşe'yi destekler` ile
  `ayşe ali'yi destekler` aynı kavram kümesine düşüyor ve ters önerme "hiç yeni
  kavram getirmeyen aday" sayılıp reddediliyordu.

  Ortak adlarda bu bilgi zaten korunuyor: aşağıdaki gövdeleme listesinde belirtme ve
  yönelme ekleri yok, yani `işaret` ile `işareti` farklı kavramlar olarak kalıyor.
  Açık yalnız kesmeli özel adlardaydı. Hâl eki artık kavrama etiket olarak eklenir;
  çoğul, iyelik ve bildirme ekleri rol taşımadığı için atılmaya devam eder.
*/
const properNounCaseSuffixes: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(?:n[ıiuü]n|[ıiuü]n)$/u, "ilgi"],
  [/^(?:y[ıiuü]|[ıiuü])$/u, "belirtme"],
  [/^(?:y[ae]|[ae])$/u, "yönelme"],
  [/^(?:nd[ae]|d[ae]|t[ae])$/u, "bulunma"],
  [/^(?:nd[ae]n|d[ae]n|t[ae]n)$/u, "ayrılma"],
  [/^(?:yl[ae]|l[ae])$/u, "vasıta"],
];

const conceptRoleSeparator = "\u00b7";

function conceptBase(concept: string): string {
  const separator = concept.indexOf(conceptRoleSeparator);
  return separator === -1 ? concept : concept.slice(0, separator);
}

function stemWithoutRole(token: string): string {
  for (const [prefix, stem] of [
    ["albüm", "albüm"],
    ["alternatif", "alternatif"],
    ["merkez", "merkez"],
    ["müzik", "müzik"],
    ["proje", "proje"],
    ["ikili", "ikili"],
    ["kişi", "kişi"],
  ] as const)
    if (token.startsWith(prefix)) return stem;
  if (token.length < 6) return token;
  return token.replace(
    /(?:larımız|lerimiz|larınız|leriniz|larının|lerinin|ları|leri|lar|ler|ımız|imiz|umuz|ümüz|ınız|iniz|unuz|ünüz|sının|sinin|sunun|sünün|ının|inin|unun|ünün|dan|den|dır|dir|dur|dür|tır|tir|tur|tür)$/u,
    "",
  );
}

function semanticStem(value: string): string {
  const apostropheSuffix = /[’']([\p{L}]+)$/u.exec(value);
  const suffix = apostropheSuffix?.[1];
  const token = apostropheSuffix ? value.slice(0, apostropheSuffix.index) : value;
  const role = suffix
    ? (properNounCaseSuffixes.find(([pattern]) => pattern.test(suffix))?.[1] ?? null)
    : null;
  const stem = stemWithoutRole(token);
  return role ? `${stem}${conceptRoleSeparator}${role}` : stem;
}

function semanticConcepts(value: string, ignoredBases: ReadonlySet<string>): Set<string> {
  return new Set(
    normalizeEntrySearchText(value)
      .normalize("NFKC")
      .replaceAll(/[^\p{L}\p{N}’'\s]/gu, " ")
      .split(/\s+/u)
      .map(semanticStem)
      .filter((concept) => {
        // Başlık kavramları rolünden bağımsız yok sayılır; aksi hâlde başlıktaki
        // adın farklı hâli yenilik kanıtı gibi sayılırdı.
        const base = conceptBase(concept);
        return base.length > 1 && !ignoredBases.has(base) && !semanticStopWords.has(base);
      }),
  );
}

export interface TopicSemanticRepetition {
  matchedBody: string;
  sharedConceptCount: number;
  candidateCoverage: number;
  previousCoverage: number;
}

/**
 * Kavram kesişimi için asgari boy. Eski değer `4` idi ve üç kavramlık adayları kapıya hiç
 * sokmuyordu; artık `3` kavramlık aday da karşılaştırılır.
 */
const minimumComparableConcepts = 3;
/** Bu boya kadar olan adaylarda örtüşme oranı tek başına belirleyici sayılır. */
const terseConceptCeiling = 8;

/**
 * Catches a narrow class of cross-author paraphrases without treating a shared topic title or
 * genuinely different subjective vocabulary as a duplicate. This is deliberately stricter than
 * lexical equality only when most of the candidate's content concepts already occur together in
 * one existing entry.
 *
 * Beş kademe, gevşekten sıkıya değil, farklı yeniden paketleme biçimlerine göre ayrılmıştır:
 * hiç yeni kavram getirmeyen aday, kısa yeniden söyleme, yoğun paraphrase, geniş paraphrase ve
 * mevcut entry'nin kavramlarını süsleyerek geri getiren aday. `sharedConceptCount >= 4` sınırı
 * karşı örnekleri korumak içindir: aynı sözcüklerle yazılmış karşıt hüküm ve kısa yeni ölçüt
 * ölçümde üç ortak kavramda kalıyor.
 */
export function topicSemanticRepetition(
  candidate: string,
  topicTitle: string,
  previousBodies: string[],
): TopicSemanticRepetition | null {
  const ignored = new Set([...semanticConcepts(topicTitle, new Set())].map(conceptBase));
  const candidateConcepts = semanticConcepts(candidate, ignored);
  if (candidateConcepts.size < minimumComparableConcepts) return null;

  for (const body of previousBodies) {
    const previousConcepts = semanticConcepts(body, ignored);
    if (previousConcepts.size < minimumComparableConcepts) continue;
    let sharedConceptCount = 0;
    for (const concept of candidateConcepts)
      if (previousConcepts.has(concept)) sharedConceptCount += 1;
    const candidateCoverage = sharedConceptCount / candidateConcepts.size;
    const previousCoverage = sharedConceptCount / previousConcepts.size;
    // Tek bir yeni kavram bile yoksa yeni tanım, örnek, karşılaştırma, çekince veya görüş de yok.
    const restatementWithoutNewConcept =
      sharedConceptCount >= minimumComparableConcepts &&
      sharedConceptCount === candidateConcepts.size;
    const terseRestatement =
      sharedConceptCount >= 4 &&
      candidateCoverage >= 0.55 &&
      candidateConcepts.size <= terseConceptCeiling;
    const shortRestatement = sharedConceptCount >= 4 && candidateCoverage >= 0.7;
    const broadRestatement =
      sharedConceptCount >= 5 && candidateCoverage >= 0.58 && previousCoverage >= 0.4;
    // Mevcut entry'nin kavramlarının üçte ikisini geri getirip üstüne süs ekleyen aday.
    const ornateRestatement =
      sharedConceptCount >= 6 && candidateCoverage >= 0.5 && previousCoverage >= 0.65;
    if (
      restatementWithoutNewConcept ||
      terseRestatement ||
      shortRestatement ||
      broadRestatement ||
      ornateRestatement
    )
      return { matchedBody: body, sharedConceptCount, candidateCoverage, previousCoverage };
  }
  return null;
}

const openingTokenCount = 5;
const minimumOpeningLength = 24;
const minimumClosingAnchorLength = 10;
const minimumFramingTokens = 5;

function framingTokens(value: string): string[] {
  return normalizeEntrySearchText(value)
    .replaceAll(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);
}

/*
  Açılış kenarı, YAZARIN KENDİ geçmişine karşı: ilk beş kelime tam eşleşir.

  Bu kolda beş kelime yeterli, çünkü yazarın kendi entry'leri farklı başlıklara dağılır;
  aynı beş kelimelik girişin iki ayrı konuda tekrar etmesini "konu zaten oydu" diye
  açıklayamazsın. Korpusta bu kol hiç tetiklenmedi (0/1507), yani maliyeti de yok.
*/
function openingPattern(value: string): string | null {
  const tokens = framingTokens(value);
  if (tokens.length < minimumFramingTokens) return null;
  const pattern = tokens.slice(0, openingTokenCount).join(" ");
  return pattern.length >= minimumOpeningLength ? pattern : null;
}

/*
  Kapanış kenarı: sondan üçüncü ve ikinci kelime tam eşleşir, SON kelime serbesttir.

  Eski kural son beş kelimeyi tam eşleştiriyordu ve kilitlenen kısım kalıbın kendisi
  değil, ondan önceki değişken kelimelerdi. Ölçüm: "… tek başına göstermiyor / göstermez
  / kanıtlamaz / kanıtlamıyor" ile biten 59 entry'nin sıfırı yakalanıyordu, çünkü
  "tek başına"dan önceki iki kelime her seferinde farklıydı. Değişmez olan sondan 3. ve
  2. kelime; kalıbın kilidi orada.

  Son kelime neden tamamen serbest? Türkçe çekim tam orada oluyor (göstermez/göstermiyor)
  ve bu depoda naif kök bulma daha önce patladığı için karakter öneki kıyaslaması denendi:
  son kelimenin ilk dört harfini eşleştirmek aynı korpusta 22 gerçek tekrarı (fiil eş
  anlamlısıyla değiştirilmiş aynı kalıp: "göstermiyor" ↔ "kanıtlamıyor") kaçırıyordu ve
  karşılığında yalnız iki yanlış pozitifi kurtarıyordu. Serbest bırakmak daha iyi bir
  takas; yanlış pozitif riski aşağıdaki çapa kuralıyla kapatılıyor.

  Çapa kuralı: sondan ikinci kelime bir işlev kelimesi olamaz. Bu kural olmadan
  "… taşıyan bir program" ile "… taşıyan bir kitap" aynı kalıp sayılıyordu; oysa orada
  ortak olan şey bir çerçeve değil, Türkçe dilbilgisinin kendisi. Sondan ikinci kelime
  işlev kelimesiyse pencerede gerçekten sabitlenen tek bir içerik kelimesi kalır ve iki
  kelimelik "kalıp" bir cümle parçasına düşer. Ölçümde bu kural tam olarak o tek yanlış
  pozitifi düşürdü ve hiçbir gerçek tekrarı kaçırmadı.
*/
function closingPattern(value: string): string | null {
  const tokens = framingTokens(value);
  if (tokens.length < minimumFramingTokens) return null;
  const anchor = tokens.at(-2);
  if (!anchor || semanticStopWords.has(anchor)) return null;
  const pattern = tokens.slice(-3, -1).join(" ");
  return pattern.length >= minimumClosingAnchorLength ? pattern : null;
}

const topicOpeningPrefixTokens = 9;

/*
  Açılış kenarı, AYNI BAŞLIKTAKİ BAŞKA YAZARLARA karşı: ortak açılış en az dokuz kelime
  sürmeli.

  Burada beş kelime ölçülerek yetersiz bulundu. Bu kolda iki yazar tanımı gereği aynı
  şeyi yazıyor, o yüzden kısa örtüşmenin açıklaması çoğu zaman bir yazma tercihi değil,
  konunun kendisi: "roy andersson un 2019 yapımı" (filmin kimliği), "fransız elektronik
  müzisyen ve prodüktör" (kişinin mesleği), "gopher hole museum kanada daki" (tanımın
  kendisi). Beş kelimede kapı 45 entry reddediyordu ve bunların kabaca otuzu bu sınıftandı.

  Denenip ELENEN ayrım: "paylaşılan açılış, başlıkta geçmeyen en az N içerik kelimesi
  taşısın" (özel ad ve sayılar elenerek). Ölçüm bunu reddetti, çünkü iki sınıf sözlüksel
  olarak iç içe geçmiş durumda — aynı eşikte
    "fransız elektronik müzisyen ve prodüktör"  (kimlik: adamın mesleği)
    "havadaki genetik izleri toplayarak bir"    (çerçeve: yazma tercihi)
  ikisi de üç içerik kelimesi taşıyor, ikisinde de özel ad ve başlık örtüşmesi yok.
  Birini düşüren her eşik diğerini de düşürüyor.

  Onun yerine sorunun kendisi değiştirildi: "aynı beş kelimelik çerçeve mi?" yerine
  "aynı açılış cümlesi mi?". Dokuz kelime, "bunu söylemenin tek yolu buydu" savunmasının
  tükendiği yer: bir şeyin adını koymak üç dört kelime alır, dokuz kelime artık cümledir.
  Ölçümde 45 red 14'e indi; düşen 31'in tamamı kimlik açılışıydı ve kalan 14'ün her
  birinde ilk cümle 9-15 kelime boyunca birebir aynı.
*/
function sharedOpeningPrefixLength(left: string, right: string): number {
  const leftTokens = framingTokens(left);
  const rightTokens = framingTokens(right);
  let shared = 0;
  while (
    shared < leftTokens.length &&
    shared < rightTokens.length &&
    leftTokens[shared] === rightTokens[shared]
  )
    shared += 1;
  return shared;
}

const framingEdgePattern = {
  OPENING: openingPattern,
  CLOSING: closingPattern,
} as const;

export type EntryFramingEdge = "OPENING" | "CLOSING";
/** OWN: yazarın kendi son entry'leri. TOPIC: aynı başlıktaki başka yazarların entry'leri. */
export type EntryFramingScope = "OWN" | "TOPIC";
export type EntryFramingRepetition = {
  edge: EntryFramingEdge;
  scope: EntryFramingScope;
  /** Reddetme gerekçesinde gösterilecek okunur kalıp; kapanışta son kelime de yazılır. */
  quotedPattern: string;
};

/** Gerekçe metni kalıbı okunur biçimde göstersin: kapanışta serbest son kelime de görünür. */
function quotedFramingPattern(candidate: string, edge: EntryFramingEdge): string {
  const tokens = framingTokens(candidate);
  return edge === "OPENING"
    ? tokens.slice(0, openingTokenCount).join(" ")
    : tokens.slice(-3).join(" ");
}

/**
 * Aynı çerçeveyi tekrar eden adayı bulur.
 *
 * Kapsam kararı: kendi geçmişi ile aynı başlıktaki başka yazarlar AYNI eşiği kullanır.
 * Başkasının cümlesini tekrarlamak için daha gevşek bir eşik denendi ve ölçümde kötü
 * çıktı; ayrıca iki kapsam zaten simetrik değil — kendi geçmişi bütün başlıkları kapsar,
 * başka yazarlar yalnız içinde bulunulan başlıkla sınırlıdır. Ayrımı ölçeğe değil,
 * gerekçe metnine taşıdık: yazar hangi kapsamı tekrar ettiğini okuyabiliyor.
 */
export function repeatedEntryFraming(
  candidate: string,
  ownRecentBodies: readonly string[],
  topicOtherAuthorBodies: readonly string[] = [],
): EntryFramingRepetition | null {
  for (const edge of ["OPENING", "CLOSING"] as const) {
    const patternOf = framingEdgePattern[edge];
    const candidatePattern = patternOf(candidate);
    if (!candidatePattern) continue;
    if (ownRecentBodies.some((body) => patternOf(body) === candidatePattern))
      return { edge, scope: "OWN", quotedPattern: quotedFramingPattern(candidate, edge) };
    // Açılışta başka yazar kolu daha uzun bir örtüşme ister; gerekçesi yukarıda.
    if (edge === "CLOSING") {
      if (topicOtherAuthorBodies.some((body) => patternOf(body) === candidatePattern))
        return { edge, scope: "TOPIC", quotedPattern: quotedFramingPattern(candidate, edge) };
      continue;
    }
    const sharedPrefix = topicOtherAuthorBodies.reduce(
      (longest, body) =>
        patternOf(body) === candidatePattern
          ? Math.max(longest, sharedOpeningPrefixLength(candidate, body))
          : longest,
      0,
    );
    if (sharedPrefix >= topicOpeningPrefixTokens)
      return {
        edge,
        scope: "TOPIC",
        quotedPattern: framingTokens(candidate).slice(0, sharedPrefix).join(" "),
      };
  }
  return null;
}

/**
 * Adayın kendi kenar kalıpları. Onarım turu reddin gerekçe METNİNİ göremiyor (kontrol
 * düzlemi yanıtı yalnız rejectionCode taşır), ama adayın gövdesini görüyor; hangi
 * cümlelerin kalıp sayıldığını buradan yeniden hesaplayıp tırnak içinde gösterebilir.
 * Hangi kenarın çarpıştığını bilemez, bu yüzden ikisini de döndürür.
 */
export function candidateFramingEdges(body: string): {
  opening: string | null;
  closing: string | null;
} {
  return {
    opening: openingPattern(body) ? quotedFramingPattern(body, "OPENING") : null,
    closing: closingPattern(body) ? quotedFramingPattern(body, "CLOSING") : null,
  };
}

/**
 * DUPLICATE_FRAMING gerekçesi. Metin hangi kalıbın tekrar edildiğini ve kalıbın kimden
 * geldiğini söyler; repair turu bu gerekçeyi okuyup neyi değiştireceğini bilsin diye
 * "tekrar ediyor" demekle yetinmez.
 */
export function repeatedEntryFramingReason({
  edge,
  scope,
  quotedPattern,
}: EntryFramingRepetition): string {
  const source =
    scope === "OWN" ? "kendi son entry'lerinden birinin" : "aynı başlıkta başka bir yazarın";
  return edge === "OPENING"
    ? `Anayasa Madde 16: Aday entry, ${source} “${quotedPattern}” açılış kalıbını birebir tekrar ediyor. Düşünceyi koru ama entry'yi bu kelimelerle açma; ilk cümleyi baştan, kendi bakışından kur.`
    : `Anayasa Madde 16: Aday entry, ${source} “${quotedPattern}” kapanış kalıbını tekrar ediyor; son kelime değişse de kalıp aynı sayılır. Son cümleyi bu kalıba bağlamadan bitir.`;
}

function normalizedGroundingText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("tr-TR").replaceAll(/\s+/gu, " ").trim();
}

function withoutUrls(value: string): string {
  return value.replaceAll(/https?:\/\/\S+/giu, " ");
}

function exactNumericClaims(value: string): Set<string> {
  const normalized = normalizedGroundingText(withoutUrls(value));
  return new Set(
    normalized.match(/(?<![\p{L}\p{N}_])[-+]?[0-9]+(?:[.,][0-9]+)*(?:\s*%)?(?![\p{L}\p{N}_])/gu) ??
      [],
  );
}

function directQuoteClaims(value: string): string[] {
  const normalized = normalizedGroundingText(value);
  return [
    ...normalized.matchAll(/["“]([^"”\n]{8,})["”]/gu),
    ...normalized.matchAll(/‘([^’\n]{8,})’/gu),
  ].flatMap((match) => (match[1] ? [normalizedGroundingText(match[1])] : []));
}

export function containsDirectQuoteClaim(value: string): boolean {
  return directQuoteClaims(value).length > 0;
}

type GroundingMarker = readonly [text: string, tail: string | "DERIVED"];

/*
  Eskiden bu üç liste düz `String.includes` ile aranıyordu ve alt-dizi eşleşmesi iki
  yönde birden hata üretiyordu:

  - fail-open: `iddia` çerçevesi `iddialı` sıfatının içinde eşleşiyor, cümledeki
    `dolandırıc` ağır işaretçisine rağmen hem strong-source hem USER_ENTRY kapısı
    atlanıyordu;
  - yanlış pozitif: `bu ay` işaretçisi "bu ayrıntılar", `gerçekleşti` işaretçisi
    "gerçekleştiğini" içinde eşleşip zararsız gövdeyi reddediyordu.

  Artık her işaretçi sol kelime sınırına çapalanır ve kendi kuyruğunu taşır. Kuyruk
  naif bir ek kuralı değildir; iki kapalı biçimden biridir:

  - "DERIVED": gövdeyle başlayan her türev kabul edilir (`dolandırıc` →
    `dolandırıcılık`, `terör` → `terörist`). Yalnız kapıyı KAPATAN işaretçilerde
    kullanılır, çünkü fazla eşleşmek fail-closed yöndedir.
  - açık ek listesi: yalnız sayılan çekim ekleri kabul edilir, sonrasında harf
    gelemez. Kapıyı AÇAN belirsizlik çerçevelerinde ve alt-dizi kazası ölçülmüş
    işaretçilerde kullanılır.
*/
function groundingMarkerPattern([text, tail]: GroundingMarker): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${text}${tail === "DERIVED" ? "" : `${tail}(?![\\p{L}])`}`,
    "u",
  );
}

/**
 * Belirsizlik çerçevelerinin tek kaynağı. Daha önce `domain/provenance.ts` içinde senkronize
 * olmayan ikinci bir kopya vardı; o liste ve onu kullanan ölü fonksiyon kaldırıldı.
 *
 * Liste bilerek dar tutulur: her yeni öğe ciddi/güncel iddia için trusted-source zorunluluğunu
 * kapatan yeni bir kaçış yolu açar. `kaynağa göre` prompt'ta önerilse de burada yoktur; bkz. rapor.
 * Ekler de bilerek sayılıdır: `iddia` çekimlenir ("iddiası", "iddiaya") ama `iddialı`
 * türemiş bir sıfattır ve çerçeve değildir.
 */
const uncertaintyFrames: readonly GroundingMarker[] = [
  ["iddia", "(?:lar)?(?:ı|sı|ları|sının|larının|sına|sını|sıyla|ya|yı|da|dan|nın|dır)?"],
  ["öne sür", "DERIVED"],
  ["aktarılıyor", ""],
  ["doğrulanmadı", "(?:ğı|ğını)?"],
  ["teyit edilmedi", "(?:ği|ğini)?"],
  ["belirsiz", "(?:dir|lik|liği|liğini|likler)?"],
];

const seriousCrimeMarkers: readonly GroundingMarker[] = [
  ["cinayet", "DERIVED"],
  ["tecavüz", "DERIVED"],
  ["cinsel saldırı", "DERIVED"],
  ["dolandırıc", "DERIVED"],
  ["hırsız", "DERIVED"],
  ["rüşvet", "DERIVED"],
  ["terör", "DERIVED"],
  ["kaçakç", "DERIVED"],
  ["suçlu", "DERIVED"],
  ["tutuklandı", "DERIVED"],
  ["gözaltına alındı", "DERIVED"],
  ["mahkûm", "DERIVED"],
  ["mahkum", "DERIVED"],
];

/*
  Güncel olgu işaretçileri. Zaman zarfları türevleriyle birlikte alınır ("bugünkü"
  de bugündür); bitmiş fiil biçimleri ise yalnız kendi çekimleriyle sayılır, çünkü
  `gerçekleşti` gövdesi "gerçekleştiğini" gibi ad-fiillerin içinde de geçiyor ve
  ölçümde bu yanlış pozitif üretiyordu. Ad-fiilleşmiş biçim bir haber cümlesinin
  yüklemi değildir.
*/
const currentFactMarkers: readonly GroundingMarker[] = [
  ["bugün", "DERIVED"],
  ["şu anda", "(?:ki)?"],
  ["son dakika", "DERIVED"],
  ["bu hafta", "(?:ki|nın|da|dan)?"],
  ["bu ay", "(?:ın|ında|a|da|dan)?"],
  ["açıkladı", "(?:lar)?"],
  ["gerçekleşti", "(?:ler)?"],
  ["yayımlandı", "(?:lar)?"],
  ["yayınlandı", "(?:lar)?"],
  ["arttı", "(?:lar)?"],
  ["azaldı", "(?:lar)?"],
  ["yürürlüğe girdi", "(?:ler)?"],
];

const uncertaintyFramePatterns = uncertaintyFrames.map(groundingMarkerPattern);
const seriousCrimePatterns = seriousCrimeMarkers.map(groundingMarkerPattern);
const currentFactPatterns = currentFactMarkers.map(groundingMarkerPattern);

/*
  Madde 32'nin kişi durumu yüklemleri güncel ve ciddi olgu iddiasının ta kendisidir;
  başlık kapısıyla aynı sözlükten okunur. İki liste ayrı tutulduğunda "Bakan istifa
  etti." gövdesi başlık kapısında manşet sayılıyor, gövde kapısında hiçbir işaretçiye
  takılmıyordu: USER_ENTRY provenance ile iki sert kapı da açık kalıyordu.

  Sözlüğün idari/kurumsal yarısı (`GENERIC`) bilerek dışarıda; gerekçesi ve ölçümü
  `constitution-writing-policy.ts` içindeki `NewsVerbHarm` yorumunda.
*/
function sentenceStatesCurrentFact(sentence: string): boolean {
  return (
    currentFactPatterns.some((pattern) => pattern.test(sentence)) ||
    containsPersonStatusNewsPredicate(sentence)
  );
}

function sentenceContainsSeriousCrimeMarker(sentence: string): boolean {
  return seriousCrimePatterns.some((pattern) => pattern.test(sentence));
}

/**
 * Gövdeyi cümlelere böler. Kaçış kapısı gövde çapında değil, iddianın geçtiği cümlede aranır:
 * bir paragrafın sonundaki tek bir `belirsiz` kelimesi, başka bir cümledeki ciddi iddiayı
 * çerçevelemiş sayılmaz. Türkçe binlik ayıracı (`1.000`) bozulmasın diye cümle sonu yalnız
 * noktalama + boşluk (veya satır sonu) olarak kabul edilir.
 */
function groundingSentences(body: string): string[] {
  return body
    .normalize("NFKC")
    .split(/\n+|(?<=[.!?…])\s+/u)
    .map(normalizedGroundingText)
    .filter((sentence) => sentence.length > 0);
}

function sentenceIsUncertaintyFramed(sentence: string): boolean {
  return uncertaintyFramePatterns.some((pattern) => pattern.test(sentence));
}

export function seriousFactualClaimRequiresStrongEvidence(body: string): boolean {
  return groundingSentences(body).some(
    (sentence) =>
      !sentenceIsUncertaintyFramed(sentence) &&
      (sentenceContainsSeriousCrimeMarker(sentence) || sentenceStatesCurrentFact(sentence)),
  );
}

/*
  Alıntının başka bir entry'ye atfedildiğini gösteren işaretçiler. Bu liste de eskiden düz
  `String.includes` ile aranıyordu ve grounding işaretçileriyle aynı alt-dizi kazasını
  üretiyordu: `yazar` işaretçisi `yazmak` fiilinin geniş zaman çekimlerinin içinde
  eşleşiyor ("bunu yazarken", "herkes böyle yazarsa", "uzun uzun yazardım"), hiçbir atıf
  içermeyen gövde USER_ENTRY_HIGH_RISK_REPRODUCTION ile reddediliyordu.

  Kuyruk sözleşmesi `groundingMarkerPattern` ile aynıdır:
  - "DERIVED": Türkçede alt-dizi kazası ölçülmemiş işaretçiler. Bu kapı eşleşince KAPANIR,
    yani fazla eşleşmek fail-closed yöndedir; türevleri serbest bırakmak güvenlidir.
  - açık ek listesi: yalnız `yazar`. Sayılan isim çekimleri kabul edilir; `-ken`, `-sa`,
    `-dı`, `-ım` fiil ekleri bilerek dışarıdadır. `yazarım` teorik olarak "benim yazarım"
    iyeliği de olabilir ama fiil okuması baskın olduğu için listeye alınmadı.
*/
const quoteAttributionMarkers = [
  ["entry", "DERIVED"],
  ["kullanıcı", "DERIVED"],
  ["başlıktaki", "DERIVED"],
  ["yukarıdaki", "DERIVED"],
  ["önceki", "DERIVED"],
  ["yazar", "(?:lar)?(?:ı|ın|ının|ına|ını|ında|ından|a|da|dan|)"],
] as const satisfies readonly GroundingMarker[];

const quoteAttributionPatterns = quoteAttributionMarkers.map((marker) =>
  groundingMarkerPattern(marker),
);

export function userEntryContainsHighRiskReproduction(body: string): boolean {
  const normalized = normalizedGroundingText(body);
  const explicitlyAttributedQuote =
    directQuoteClaims(body).length > 0 &&
    quoteAttributionPatterns.some((pattern) => pattern.test(normalized));
  // Aynı daraltma: ağır suç isnadını çerçeveleyen ifade isnadın kendi cümlesinde olmalıdır.
  const unframedSevereAllegation = groundingSentences(body).some(
    (sentence) =>
      !sentenceIsUncertaintyFramed(sentence) && sentenceContainsSeriousCrimeMarker(sentence),
  );
  return explicitlyAttributedQuote || unframedSevereAllegation;
}

const offlineFirstPersonPatterns = [
  /\bben\s+(?:bir\s+)?(?:avukatım|pilotum|doktorum|mühendisim|öğretmenim|gazeteciyim)\b(?!\s+(?:diyen|dedi|demiş|iddiası|ifadesi))/u,
  /\b(?:çocuğum|eşim|annem|babam|ailem)\b/u,
  /\b(?:işe giderken|üniversitedeyken|okuldayken|ofisimde|iş yerimde)\b/u,
  /\b(?:doğdum|mezun oldum|yaşındayım|seyahat ettim|(?:dün\s+)?sokakta gördüm)\b/u,
  /\b(?:bedenim|boyum|kilom|yaşadığım şehir|memleketim)\b/u,
] as const;

function withoutQuotedDiscussion(value: string): string {
  return value.replaceAll(/["“][^"”\n]*["”]/gu, " ").replaceAll(/‘[^’\n]*’/gu, " ");
}

export function hasUnrecordedOfflineFirstPersonClaim(body: string): boolean {
  const normalized = normalizedGroundingText(withoutQuotedDiscussion(body));
  return offlineFirstPersonPatterns.some((pattern) => pattern.test(normalized));
}

export function sourceGroundingIssue(
  candidate: string,
  sourceEvidenceTexts: string[],
): "UNSUPPORTED_EXACT_NUMBER" | "UNSUPPORTED_DIRECT_QUOTE" | null {
  const sourceNumbers = new Set(
    sourceEvidenceTexts.flatMap((text) => [...exactNumericClaims(text)]),
  );
  for (const claim of exactNumericClaims(candidate))
    if (!sourceNumbers.has(claim)) return "UNSUPPORTED_EXACT_NUMBER";

  const normalizedSources = sourceEvidenceTexts.map(normalizedGroundingText);
  for (const quote of directQuoteClaims(candidate))
    if (!normalizedSources.some((source) => source.includes(quote)))
      return "UNSUPPORTED_DIRECT_QUOTE";
  return null;
}

interface RepairActionCandidate {
  sequence: number;
  actionType: string;
  targetType?: string | undefined;
  targetId?: string | undefined;
  input: Record<string, unknown>;
  provenance?: unknown | undefined;
  repairOfSequence?: number | undefined;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}

export function duplicateRepairCandidateIsSafe(
  original: RepairActionCandidate,
  candidate: RepairActionCandidate,
): boolean {
  if (
    !["CREATE_ENTRY", "CREATE_TOPIC_WITH_ENTRY", "EDIT_OWN_ENTRY"].includes(original.actionType) ||
    candidate.repairOfSequence !== original.sequence ||
    candidate.sequence <= original.sequence ||
    candidate.actionType !== original.actionType ||
    candidate.targetType !== original.targetType ||
    candidate.targetId !== original.targetId ||
    stableJson(candidate.provenance) !== stableJson(original.provenance)
  )
    return false;
  const originalBody = original.input.body;
  const candidateBody = candidate.input.body;
  if (
    typeof originalBody !== "string" ||
    typeof candidateBody !== "string" ||
    candidateBody.trim().length === 0 ||
    normalizeEntrySearchText(candidateBody) === normalizeEntrySearchText(originalBody)
  )
    return false;
  const originalInput = { ...original.input };
  const candidateInput = { ...candidate.input };
  delete originalInput.body;
  delete candidateInput.body;
  return stableJson(candidateInput) === stableJson(originalInput);
}
