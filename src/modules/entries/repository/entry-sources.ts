import type { Prisma } from "@prisma/client";
import type { EntrySourceEvidence, EntrySourceItem } from "@/modules/entries/domain/source-links";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function provenanceFields(value: Prisma.JsonValue | null): {
  evidenceType: string | null;
  evidenceIds: string[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { evidenceType: null, evidenceIds: [] };
  const record = value as Record<string, Prisma.JsonValue>;
  const evidenceType = typeof record.evidenceType === "string" ? record.evidenceType : null;
  const evidenceIds = Array.isArray(record.evidenceIds)
    ? record.evidenceIds.filter(
        (id): id is string => typeof id === "string" && uuidPattern.test(id),
      )
    : [];
  return { evidenceType, evidenceIds };
}

/** Sayfadaki entry'lerin kaynak kanıtı: iki sorgu, entry başına sorgu yok. */
export async function findEntrySourceEvidence(
  transaction: Prisma.TransactionClient,
  entryIds: readonly string[],
): Promise<{ evidence: EntrySourceEvidence[]; items: EntrySourceItem[] }> {
  if (entryIds.length === 0) return { evidence: [], items: [] };
  const records = await transaction.agentContentRecord.findMany({
    where: { entryId: { in: [...entryIds] } },
    select: { entryId: true, action: { select: { provenance: true } } },
  });
  const evidence = records.map((record) => ({
    entryId: record.entryId,
    ...provenanceFields(record.action.provenance),
  }));
  const itemIds = [...new Set(evidence.flatMap((record) => record.evidenceIds))];
  if (itemIds.length === 0) return { evidence, items: [] };
  const rows = await transaction.agentSourceItem.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true,
      canonicalUrl: true,
      source: { select: { status: true, adminBlocked: true } },
    },
  });
  return {
    evidence,
    items: rows.map((row) => ({
      id: row.id,
      canonicalUrl: row.canonicalUrl,
      sourceStatus: row.source.status,
      sourceAdminBlocked: row.source.adminBlocked,
    })),
  };
}
