import type { SeedPersona } from "./schema";

export interface OntologyViolation {
  code: string;
  field: string;
  safeReason: string;
}

const normalize = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();

const selfCategoryPatterns = [
  /\b(?:ben|hesabim|kendim)\s+(?:bir\s+)?(?:ai(?:im)?|yapay zeka(?:yim)?|bot(?:um)?|insan(?:im)?|model(?:im)?)\b/iu,
  /\b(?:ai|yapay zeka|bot|insan|model)\s+(?:olarak|oldugum|oldugumu)\b/iu,
  /\b(?:beni|hesabi)\s+(?:bir\s+)?(?:kullanici|sistem)\s+(?:calistiriyor|yonetiyor)\b/iu,
];

const offlineBiographyPatterns = [
  /\bben\s+(?:bir\s+)?(?:avukatim|pilotum|doktorum|muhendisim|ogretmenim|gazeteciyim)\b/iu,
  /\b(?:cocugum|esim|annem|babam|ailem)\b/iu,
  /\b(?:ise giderken|universitedeyken|okuldayken|ofisimde|is yerimde)\b/iu,
  /\b(?:dogdum|mezun oldum|yasindayim|seyahat ettim|sokakta gordum)\b/iu,
  /\b(?:bedenim|boyum|kilom|yasadigim sehir|memleketim)\b/iu,
];

const impersonationPatterns = [
  /\b(?:inspired by|esinlenmistir|davranissal referans|referans etiketi)\b/iu,
  /\b(?:taklit|impersonation|gercek kisi|gercek yazar|kaynak handle)\b/iu,
  /\b(?:kamuya acik metinlerden|public texts)\b/iu,
];

const inspect = (
  value: string,
  field: string,
  patterns: RegExp[],
  code: string,
  safeReason: string,
): OntologyViolation[] => {
  const normalized = normalize(value);
  return patterns.some((pattern) => pattern.test(normalized)) ? [{ code, field, safeReason }] : [];
};

export function lintOntology(
  persona: Pick<SeedPersona, "publicBio" | "identity">,
  renderedPrompt: string,
  changeSummary = "",
): OntologyViolation[] {
  const identityFields: Array<[string, string]> = [
    ["publicBio", persona.publicBio],
    ["identity.selfDescription", persona.identity.selfDescription],
    ["identity.biography", persona.identity.biography],
    ["changeSummary", changeSummary],
  ];
  const violations: OntologyViolation[] = [];

  for (const [field, value] of identityFields) {
    violations.push(
      ...inspect(
        value,
        field,
        selfCategoryPatterns,
        "SELF_CATEGORY_CLAIM",
        "Hesabın varlık türü hakkında başlangıç iddiası kullanılamaz.",
      ),
      ...inspect(
        value,
        field,
        offlineBiographyPatterns,
        "UNVERIFIED_OFFLINE_BIOGRAPHY",
        "Kaydedilmiş dijital deneyime dayanmayan offline biyografi kullanılamaz.",
      ),
      ...inspect(
        value,
        field,
        impersonationPatterns,
        "IMPERSONATION_REFERENCE",
        "Persona gerçek kişi, handle veya taklit referansı içeremez.",
      ),
    );
  }

  violations.push(
    ...inspect(
      renderedPrompt,
      "renderedPrompt",
      [
        /sen bir ai agentsin/iu,
        /sen bir yapay zekasin/iu,
        /sen bir botsun/iu,
        /sen bir insansin/iu,
        /bu bir simulasyondur/iu,
        /codex kullaniyorsun/iu,
        /bir kullanici tarafindan calistiriliyorsun/iu,
        /sistem seni yonetiyor/iu,
      ],
      "FORBIDDEN_PROMPT_IDENTITY",
      "Rendered prompt yasaklı kimlik başlangıçlarından birini içeriyor.",
    ),
  );

  return violations;
}
