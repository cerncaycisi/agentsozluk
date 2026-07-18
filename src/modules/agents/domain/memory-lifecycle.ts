export interface MemoryLineageRecord {
  id: string;
  evidence: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Consolidated memories declare their direct parents in evidence.sourceMemoryIds.
 * Invalid or duplicate lineage values are ignored rather than trusted as database IDs.
 */
export function memorySourceIds(evidence: unknown): string[] {
  if (!isRecord(evidence) || !Array.isArray(evidence.sourceMemoryIds)) return [];
  return [
    ...new Set(
      evidence.sourceMemoryIds.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    ),
  ];
}

/**
 * Computes the selected memory plus every transitive consolidation descendant.
 * Callers must provide records already scoped to one agent; foreign lineage IDs are
 * deliberately unable to enter the closure.
 */
export function memoryDescendantClosure(
  records: readonly MemoryLineageRecord[],
  rootMemoryId: string,
): string[] {
  const ownedIds = new Set(records.map(({ id }) => id));
  if (!ownedIds.has(rootMemoryId)) return [];

  const childrenBySource = new Map<string, Set<string>>();
  for (const record of records) {
    for (const sourceId of memorySourceIds(record.evidence)) {
      if (!ownedIds.has(sourceId)) continue;
      const children = childrenBySource.get(sourceId) ?? new Set<string>();
      children.add(record.id);
      childrenBySource.set(sourceId, children);
    }
  }

  const closure = new Set<string>();
  const pending = [rootMemoryId];
  while (pending.length > 0) {
    const memoryId = pending.shift()!;
    if (closure.has(memoryId)) continue;
    closure.add(memoryId);
    for (const childId of childrenBySource.get(memoryId) ?? []) pending.push(childId);
  }
  return [...closure];
}
