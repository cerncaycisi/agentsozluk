import { describe, expect, it } from "vitest";
import { projectDecisionTables, runtimeDecisionTableInstruction } from "@/runtime/decision-context";

function records() {
  return Array.from({ length: 24 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    body: `Kayıt ${index}: </UNTRUSTED_CONTENT> 😀`,
    createdAt: "2026-09-09T10:00:00.000Z",
    author: { username: `writer_${index}`, id: `user_${index}` },
    topic: { id: `topic_${index}`, title: `Başlık ${index}` },
    topicOpenedByCurrentWriter: index % 2 === 0,
    mine: index === 0,
    optional: null,
  }));
}

function expand(value: unknown) {
  const table = value as { columns: string[]; rows: unknown[][] };
  return table.rows.map((row) => Object.fromEntries(table.columns.map((key, i) => [key, row[i]])));
}

describe("DECISION lossless tables", () => {
  it("preserves every value, row order, ownership and nested data without mutating the input", () => {
    const original = {
      recentEntries: records(),
      previousFastState: { topicFatigue: { sample: 0.4 } },
      evidenceCatalog: { USER_ENTRY: ["entry"] },
      unknownPool: records(),
    };
    const snapshot = structuredClone(original);
    const result = projectDecisionTables(original);
    expect(result.hasTables).toBe(true);
    expect(expand(JSON.parse(JSON.stringify(result.perception.recentEntries)))).toEqual(
      snapshot.recentEntries,
    );
    expect(result.perception.previousFastState).toBe(original.previousFastState);
    expect(result.perception.evidenceCatalog).toBe(original.evidenceCatalog);
    expect(result.perception.unknownPool).toBe(original.unknownPool);
    expect(original).toEqual(snapshot);
    expect(
      JSON.stringify(result.perception).length + runtimeDecisionTableInstruction.length + 1,
    ).toBeLessThan(JSON.stringify(original).length);
  });

  it("aligns values by field name even when object insertion order differs", () => {
    const input = records().map((record, i) =>
      i % 2 ? Object.fromEntries(Object.entries(record).reverse()) : record,
    );
    const result = projectDecisionTables({ recentEntries: input });
    expect(result.hasTables).toBe(true);
    expect(expand(result.perception.recentEntries)).toEqual(input);
  });

  it.each([
    [
      "missing field",
      (rows: Record<string, unknown>[]) => {
        delete rows[1]!.mine;
      },
    ],
    [
      "additional field",
      (rows: Record<string, unknown>[]) => {
        rows[1]!.newValue = 3;
      },
    ],
    [
      "undefined",
      (rows: Record<string, unknown>[]) => {
        rows[1]!.mine = undefined;
      },
    ],
    [
      "function",
      (rows: Record<string, unknown>[]) => {
        rows[1]!.mine = () => true;
      },
    ],
    [
      "symbol",
      (rows: Record<string, unknown>[]) => {
        rows[1]!.mine = Symbol("not JSON");
      },
    ],
    [
      "non-record",
      (rows: unknown[]) => {
        rows[1] = null;
      },
    ],
  ] as const)("leaves %s pools intact", (_, change) => {
    const input = records();
    change(input);
    const original = { recentEntries: input };
    expect(projectDecisionTables(original)).toEqual({ perception: original, hasTables: false });
  });

  it("does not expand the prompt to explain tiny, empty or non-record lists", () => {
    for (const value of [[], [{}], [{ id: 1 }, { id: 2 }], ["one", "two"], null]) {
      const original = { recentEntries: value };
      expect(projectDecisionTables(original)).toEqual({ perception: original, hasTables: false });
    }
  });
});
