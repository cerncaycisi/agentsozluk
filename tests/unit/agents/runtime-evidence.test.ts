import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveRuntimePerceptionEvidence } from "@/modules/agents/domain/runtime-evidence";

describe("runtime perception evidence contract", () => {
  it("derives all frozen snapshot IDs and source item IDs without flattening their action types", () => {
    const runId = randomUUID();
    const sourceId = randomUUID();
    const sourceItemId = randomUUID();
    const entryId = randomUUID();
    const perception = {
      recentEntries: [{ id: entryId, topic: { id: randomUUID() } }],
      sourceItems: [{ sourceId, itemId: sourceItemId, sourceStatus: "SEED" }],
      nonEvidence: "not-a-uuid",
    };

    const evidence = deriveRuntimePerceptionEvidence(perception, [runId, runId]);

    expect(evidence.ids).toEqual(expect.arrayContaining([runId, sourceId, sourceItemId, entryId]));
    expect(new Set(evidence.ids).size).toBe(evidence.ids.length);
    expect(evidence.sourceItemIds).toEqual([sourceItemId]);
  });

  it("does not admit malformed additional IDs", () => {
    expect(deriveRuntimePerceptionEvidence({}, ["not-a-uuid"]).ids).toEqual([]);
  });
});
