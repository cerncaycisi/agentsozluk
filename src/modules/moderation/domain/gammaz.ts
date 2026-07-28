export const ENTRY_GAMMAZ_REASONS = [
  "GAMMAZ_1_NOT_DICTIONARY_FUNCTION",
  "GAMMAZ_2_NON_TURKISH_NON_QUOTE",
  "GAMMAZ_3_MISSING_CONTINUATION_CONTEXT",
  "GAMMAZ_4_PHYSICAL_ENTRY_REFERENCE",
  "GAMMAZ_5_DICTIONARY_META",
  "GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK",
  "GAMMAZ_8_DUPLICATE_ENTRY",
  "GAMMAZ_9_DELETED_BKZ_TARGET",
] as const;

export const TOPIC_GAMMAZ_REASONS = [
  "GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK",
  "TOPIC_CANONICALIZATION_REQUEST",
] as const;

export const GAMMAZ_REASONS = [...ENTRY_GAMMAZ_REASONS, "TOPIC_CANONICALIZATION_REQUEST"] as const;

export type GammazReason = (typeof GAMMAZ_REASONS)[number];

export const MODERATION_CAPABILITIES = [
  "GAMMAZ",
  "FORMAT_MODERATOR",
  "LEGAL_REVIEWER",
  "APPEAL_DECIDER",
] as const;

export type ModerationCapabilityName = (typeof MODERATION_CAPABILITIES)[number];

export const LEGACY_REPORT_REASONS = [
  "SPAM",
  "HARASSMENT",
  "HATE",
  "ILLEGAL_CONTENT",
  "PERSONAL_DATA",
  "COPYRIGHT",
  "OFF_TOPIC",
  "OTHER",
] as const;

export const ALL_REPORT_REASONS = [...LEGACY_REPORT_REASONS, ...GAMMAZ_REASONS] as const;

export const LEGAL_RISK_CATEGORIES = [
  "COPYRIGHT",
  "PERSONAL_RIGHTS",
  "COMMERCIAL_RISK",
  "ILLEGAL_CONTENT",
] as const;

export type LegalRiskCategory = (typeof LEGAL_RISK_CATEGORIES)[number];

export interface GammazEvidence {
  duplicateEntryPublicId?: number;
  referenceEntryPublicId?: number;
  legalRiskCategory?: LegalRiskCategory;
  suggestedTitle?: string;
}

const REASON_LABELS: Record<GammazReason, string> = {
  GAMMAZ_1_NOT_DICTIONARY_FUNCTION: "1 · tanım, devam, örnek, alıntı ya da bkz değil",
  GAMMAZ_2_NON_TURKISH_NON_QUOTE: "2 · alıntı/örnek olmadığı hâlde Türkçe değil",
  GAMMAZ_3_MISSING_CONTINUATION_CONTEXT: "3 · devam ettirdiği entry silinmiş",
  GAMMAZ_4_PHYSICAL_ENTRY_REFERENCE: "4 · başlıktaki entry’lere fiziksel referans",
  GAMMAZ_5_DICTIONARY_META: "5 · başlığın Sözlük’teki hâliyle ilgili",
  GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK: "7 · hukuki veya ticari risk",
  GAMMAZ_8_DUPLICATE_ENTRY: "8 · daha önce yazılmış",
  GAMMAZ_9_DELETED_BKZ_TARGET: "9 · refere edilen entry silinmiş",
  TOPIC_CANONICALIZATION_REQUEST: "Başlık · kanonik adres düzeltme talebi",
};

const LEGACY_REASON_LABELS: Record<(typeof LEGACY_REPORT_REASONS)[number], string> = {
  SPAM: "Tarihsel · spam",
  HARASSMENT: "Tarihsel · taciz",
  HATE: "Tarihsel · nefret söylemi",
  ILLEGAL_CONTENT: "Tarihsel · hukuka aykırı içerik",
  PERSONAL_DATA: "Tarihsel · kişisel veri",
  COPYRIGHT: "Tarihsel · telif",
  OFF_TOPIC: "Tarihsel · konu dışı",
  OTHER: "Tarihsel · diğer",
};

export const LEGAL_RISK_LABELS: Record<LegalRiskCategory, string> = {
  COPYRIGHT: "Telif hakkı",
  PERSONAL_RIGHTS: "Kişilik hakları",
  COMMERCIAL_RISK: "Ticari risk",
  ILLEGAL_CONTENT: "Hukuka aykırı içerik",
};

export function gammazReasonLabel(reason: string): string {
  if (reason in REASON_LABELS) return REASON_LABELS[reason as GammazReason];
  if (reason in LEGACY_REASON_LABELS)
    return LEGACY_REASON_LABELS[reason as keyof typeof LEGACY_REASON_LABELS];
  return reason;
}

export function reasonsForTarget(targetType: "ENTRY" | "TOPIC"): readonly GammazReason[] {
  return targetType === "ENTRY" ? ENTRY_GAMMAZ_REASONS : TOPIC_GAMMAZ_REASONS;
}

export function isGammazReason(value: string): value is GammazReason {
  return (GAMMAZ_REASONS as readonly string[]).includes(value);
}

export function gammazEvidenceRows(evidence: unknown): Array<{ label: string; value: string }> {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return [];
  const record = evidence as Record<string, unknown>;
  const rows: Array<{ label: string; value: string }> = [];
  if (typeof record.duplicateEntryPublicId === "number")
    rows.push({ label: "Önceki entry", value: `#${record.duplicateEntryPublicId}` });
  if (typeof record.referenceEntryPublicId === "number")
    rows.push({ label: "Dayanak entry", value: `#${record.referenceEntryPublicId}` });
  if (typeof record.legalRiskCategory === "string" && record.legalRiskCategory in LEGAL_RISK_LABELS)
    rows.push({
      label: "Risk hattı",
      value: LEGAL_RISK_LABELS[record.legalRiskCategory as LegalRiskCategory],
    });
  if (typeof record.suggestedTitle === "string")
    rows.push({ label: "Önerilen başlık", value: record.suggestedTitle });
  return rows;
}
