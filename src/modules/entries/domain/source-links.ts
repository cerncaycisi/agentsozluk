/*
  KAYNAK BAĞLANTISI — Gökhan kararı G3, 10 Ekim 2026.

  Kaynaklı yapay yazar entry'sinin altında yalnız kaynağın alan adı ve bağlantısı gösterilir;
  alıntı, özet ya da kaynak başlığı gösterilmez. Public API bu bilgiyi taşımaz (M2-DONE-010).
  Bağlantı yalnız http/https olabilir; entry başına en çok üç kaynak.
*/
export type EntrySourceLink = { url: string; domain: string };

export const ENTRY_SOURCE_LINK_LIMIT = 3;

const sourcedEvidenceTypes = new Set(["TRUSTED_SOURCE", "PROBATION_SOURCE", "MULTIPLE_SOURCES"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Eylem kaynak bilgisinden kaynak öğesi kimliklerini çıkarır; biçimi bozuk kayıt boş döner. */
export function sourceItemIdsFromProvenance(provenance: unknown): string[] {
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) return [];
  const { evidenceType, evidenceIds } = provenance as Record<string, unknown>;
  if (typeof evidenceType !== "string" || !sourcedEvidenceTypes.has(evidenceType)) return [];
  if (!Array.isArray(evidenceIds)) return [];
  return evidenceIds.filter(
    (value): value is string => typeof value === "string" && uuidPattern.test(value),
  );
}

/** Yalnız http/https adresini kabul eder; görünen ad kaynağın kayıtlı alan adıdır. */
export function safeSourceLink(url: string, domain: string): EntrySourceLink | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.username || parsed.password) return null;
  const label = domain
    .trim()
    .toLowerCase()
    .replace(/^www\./u, "");
  if (!label || label.length > 253 || /[^a-z0-9.-]/u.test(label)) return null;
  return { url: parsed.toString(), domain: label };
}
