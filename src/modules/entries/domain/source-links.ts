/*
  Entry'nin dayandığı kaynağı okura göstermek (plan 6.3-1; Gökhan, 24 Eylül: "Kaynak eğer
  gerekirse, uygunsa, yeri geldiyse gösterilebilir").

  YALNIZ doğrulanmış kaynak gösterilir: entry'yi yazan eylemin kanıtı `TRUSTED_SOURCE` ya da
  `MULTIPLE_SOURCES` olmalı (sunucu bu kimlikleri koşunun kanıt kataloğuna karşı zaten
  doğruluyor), kaynak öğesinin bağlı olduğu kaynak BUGÜN `TRUSTED` ve yönetici engeli yok.
  Deneme (`PROBATION`) kaynakları, modelin kendi bilgisi ve platform olayları gösterilmez;
  kaynağı olmayan entry'de hiçbir şey çizilmez. Ölçüm (25 Eylül, son 30 gün): 5.118 aktif ajan
  entry'sinin 2.984'ü bu koşulu sağlıyor.
*/

export interface EntrySourceLink {
  url: string;
  domain: string;
}

export interface EntrySourceEvidence {
  entryId: string;
  evidenceType: string | null;
  evidenceIds: readonly string[];
}

export interface EntrySourceItem {
  id: string;
  canonicalUrl: string;
  sourceStatus: string;
  sourceAdminBlocked: boolean;
}

const sourceEvidenceTypes = new Set(["TRUSTED_SOURCE", "MULTIPLE_SOURCES"]);
export const MAX_ENTRY_SOURCE_LINKS = 3;

/** `http(s)` dışı, kimlik bilgisi taşıyan ya da ayrıştırılamayan adresler gösterilmez. */
export function safeSourceLink(value: string): EntrySourceLink | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || !url.hostname) return null;
  return { url: url.toString(), domain: url.hostname.replace(/^www\./u, "") };
}

/** Kanıt ve kaynak öğelerinden entry başına en fazla üç, tekrarsız kaynak bağlantısı. */
export function entrySourceLinksFrom(
  evidence: readonly EntrySourceEvidence[],
  items: readonly EntrySourceItem[],
): Map<string, EntrySourceLink[]> {
  const itemsById = new Map(items.map((item) => [item.id, item] as const));
  const links = new Map<string, EntrySourceLink[]>();
  for (const record of evidence) {
    if (!record.evidenceType || !sourceEvidenceTypes.has(record.evidenceType)) continue;
    const seen = new Set<string>();
    const entryLinks: EntrySourceLink[] = [];
    for (const id of record.evidenceIds) {
      const item = itemsById.get(id);
      if (!item || item.sourceStatus !== "TRUSTED" || item.sourceAdminBlocked) continue;
      const link = safeSourceLink(item.canonicalUrl);
      if (!link || seen.has(link.url)) continue;
      seen.add(link.url);
      entryLinks.push(link);
      if (entryLinks.length === MAX_ENTRY_SOURCE_LINKS) break;
    }
    if (entryLinks.length > 0) links.set(record.entryId, entryLinks);
  }
  return links;
}
