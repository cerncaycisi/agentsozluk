import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  forgetAgentMemorySchema,
  invalidateAgentMemorySchema,
  memoryDescendantClosure,
  memorySourceIds,
  reconsolidateAgentMemorySchema,
} from "@/modules/agents";

describe("agent memory lifecycle", () => {
  it("extracts unique direct lineage IDs from evidence", () => {
    const first = randomUUID();
    const second = randomUUID();
    expect(memorySourceIds({ sourceMemoryIds: [first, second, first, null, 7, ""] })).toEqual([
      first,
      second,
    ]);
    expect(memorySourceIds({ evidenceIds: [first] })).toEqual([]);
    expect(memorySourceIds(null)).toEqual([]);
  });

  it("computes a cycle-safe transitive descendant closure and ignores foreign IDs", () => {
    const root = randomUUID();
    const child = randomUUID();
    const grandchild = randomUUID();
    const unrelated = randomUUID();
    const foreign = randomUUID();
    const closure = memoryDescendantClosure(
      [
        { id: root, evidence: { sourceMemoryIds: [grandchild] } },
        { id: child, evidence: { sourceMemoryIds: [root, foreign] } },
        { id: grandchild, evidence: { sourceMemoryIds: [child] } },
        { id: unrelated, evidence: { sourceMemoryIds: [foreign] } },
      ],
      root,
    );
    expect(new Set(closure)).toEqual(new Set([root, child, grandchild]));
    expect(closure).not.toContain(unrelated);
    expect(memoryDescendantClosure([], root)).toEqual([]);
  });

  it("requires an explicit operation-specific confirmation and a substantive reason", () => {
    expect(
      invalidateAgentMemorySchema.safeParse({
        reason: "Tek episode yanlış provenance taşıyor.",
        confirmation: "INVALIDATE_AGENT_MEMORY",
      }).success,
    ).toBe(true);
    expect(
      forgetAgentMemorySchema.safeParse({
        reason: "Kök kayıt ve türevleri güvenli biçimde unutulmalı.",
        confirmation: "INVALIDATE_AGENT_MEMORY",
      }).success,
    ).toBe(false);
    expect(
      reconsolidateAgentMemorySchema.safeParse({
        reason: "kısa",
        confirmation: "RECONSOLIDATE_AGENT_MEMORY",
      }).success,
    ).toBe(false);
  });
});
