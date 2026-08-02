const uuidPattern = /^[0-9a-f]{8}-[0-9a-f-]{27}$/iu;

export interface RuntimePerceptionEvidence {
  ids: string[];
  sourceItemIds: string[];
}

function collectEvidence(
  value: unknown,
  ids: Set<string>,
  sourceItemIds: Set<string>,
  insideSourceItems = false,
): void {
  if (typeof value === "string") {
    if (uuidPattern.test(value)) ids.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectEvidence(item, ids, sourceItemIds, insideSourceItems);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const nestedInsideSourceItems = insideSourceItems || key === "sourceItems";
    if (
      insideSourceItems &&
      key === "itemId" &&
      typeof nested === "string" &&
      uuidPattern.test(nested)
    )
      sourceItemIds.add(nested);
    collectEvidence(nested, ids, sourceItemIds, nestedInsideSourceItems);
  }
}

/**
 * Derive the immutable evidence IDs a runtime decision may cite from the
 * frozen perception snapshot. The optional IDs preserve the existing
 * platform-event run identity without widening action provenance.
 */
export function deriveRuntimePerceptionEvidence(
  perception: unknown,
  additionalIds: readonly string[] = [],
): RuntimePerceptionEvidence {
  const ids = new Set<string>();
  const sourceItemIds = new Set<string>();
  collectEvidence(perception, ids, sourceItemIds);
  for (const id of additionalIds) if (uuidPattern.test(id)) ids.add(id);
  return {
    ids: [...ids],
    sourceItemIds: [...sourceItemIds],
  };
}
