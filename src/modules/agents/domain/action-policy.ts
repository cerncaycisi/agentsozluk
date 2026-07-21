import { normalizeEntrySearchText } from "@/modules/entries/domain/entry";

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

const uncertaintyMarkers = [
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

export function seriousFactualClaimRequiresStrongEvidence(body: string): boolean {
  const normalized = normalizedGroundingText(body);
  if (uncertaintyMarkers.some((marker) => normalized.includes(marker))) return false;
  return [...seriousCrimeMarkers, ...currentFactMarkers].some((marker) =>
    normalized.includes(marker),
  );
}

export function userEntryContainsHighRiskReproduction(body: string): boolean {
  const normalized = normalizedGroundingText(body);
  const explicitlyAttributedQuote =
    directQuoteClaims(body).length > 0 &&
    ["entry", "kullanıcı", "yazar", "başlıktaki", "yukarıdaki", "önceki"].some((marker) =>
      normalized.includes(marker),
    );
  const unframedSevereAllegation =
    seriousCrimeMarkers.some((marker) => normalized.includes(marker)) &&
    !uncertaintyMarkers.some((marker) => normalized.includes(marker));
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
