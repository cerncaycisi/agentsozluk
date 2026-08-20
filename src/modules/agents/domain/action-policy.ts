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

function semanticStem(value: string): string {
  const token = value.replaceAll(/[’'][\p{L}]+$/gu, "");
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

function semanticConcepts(value: string, ignored: ReadonlySet<string>): Set<string> {
  return new Set(
    normalizeEntrySearchText(value)
      .normalize("NFKC")
      .replaceAll(/[^\p{L}\p{N}’'\s]/gu, " ")
      .split(/\s+/u)
      .map(semanticStem)
      .filter((token) => token.length > 1 && !ignored.has(token) && !semanticStopWords.has(token)),
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
  const ignored = semanticConcepts(topicTitle, new Set());
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

const framingTokenCount = 5;
const minimumFramingLength = 24;

function framingTokens(value: string): string[] {
  return normalizeEntrySearchText(value)
    .replaceAll(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);
}

function longEdgePattern(value: string, edge: "OPENING" | "CLOSING"): string | null {
  const tokens = framingTokens(value);
  if (tokens.length < framingTokenCount) return null;
  const pattern =
    edge === "OPENING"
      ? tokens.slice(0, framingTokenCount).join(" ")
      : tokens.slice(-framingTokenCount).join(" ");
  return pattern.length >= minimumFramingLength ? pattern : null;
}

export function repeatedEntryFraming(
  candidate: string,
  previousBodies: string[],
): "OPENING" | "CLOSING" | null {
  for (const edge of ["OPENING", "CLOSING"] as const) {
    const candidatePattern = longEdgePattern(candidate, edge);
    if (
      candidatePattern &&
      previousBodies.some((body) => longEdgePattern(body, edge) === candidatePattern)
    )
      return edge;
  }
  return null;
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

/**
 * Belirsizlik çerçevelerinin tek kaynağı. Daha önce `domain/provenance.ts` içinde senkronize
 * olmayan ikinci bir kopya vardı; o liste ve onu kullanan ölü fonksiyon kaldırıldı.
 *
 * Liste bilerek dar tutulur: her yeni öğe ciddi/güncel iddia için trusted-source zorunluluğunu
 * kapatan yeni bir kaçış yolu açar. `kaynağa göre` prompt'ta önerilse de burada yoktur; bkz. rapor.
 */
const uncertaintyFrames = [
  "iddia",
  "öne sür",
  "aktarılıyor",
  "doğrulanmadı",
  "teyit edilmedi",
  "belirsiz",
];
const seriousCrimeMarkers = [
  "cinayet",
  "tecavüz",
  "cinsel saldırı",
  "dolandırıc",
  "hırsız",
  "rüşvet",
  "terör",
  "kaçakç",
  "suçlu",
  "tutuklandı",
  "gözaltına alındı",
  "mahkûm",
  "mahkum",
];
const currentFactMarkers = [
  "bugün",
  "şu anda",
  "son dakika",
  "bu hafta",
  "bu ay",
  "açıkladı",
  "gerçekleşti",
  "yayımlandı",
  "yayınlandı",
  "arttı",
  "azaldı",
  "yürürlüğe girdi",
];

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
  return uncertaintyFrames.some((frame) => sentence.includes(frame));
}

export function seriousFactualClaimRequiresStrongEvidence(body: string): boolean {
  return groundingSentences(body).some(
    (sentence) =>
      !sentenceIsUncertaintyFramed(sentence) &&
      [...seriousCrimeMarkers, ...currentFactMarkers].some((marker) => sentence.includes(marker)),
  );
}

export function userEntryContainsHighRiskReproduction(body: string): boolean {
  const normalized = normalizedGroundingText(body);
  const explicitlyAttributedQuote =
    directQuoteClaims(body).length > 0 &&
    ["entry", "kullanıcı", "yazar", "başlıktaki", "yukarıdaki", "önceki"].some((marker) =>
      normalized.includes(marker),
    );
  // Aynı daraltma: ağır suç isnadını çerçeveleyen ifade isnadın kendi cümlesinde olmalıdır.
  const unframedSevereAllegation = groundingSentences(body).some(
    (sentence) =>
      !sentenceIsUncertaintyFramed(sentence) &&
      seriousCrimeMarkers.some((marker) => sentence.includes(marker)),
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
