import { describe, expect, it } from "vitest";
import {
  compareReceipts,
  type GreatResetReceipt,
} from "@/modules/maintenance/repository/great-reset-receipt";

function receipt(overrides: Partial<GreatResetReceipt> = {}): GreatResetReceipt {
  return {
    version: 1,
    sha256: "x",
    sections: { content: "c", sequences: "q", schema: "s", security: "a", database: "d" },
    tables: { topics: { rows: 2, sha256: "t" }, entries: { rows: 3, sha256: "e" } },
    ...overrides,
  };
}

describe("great reset receipt comparison", () => {
  it("is equal only when every section and table matches", () => {
    expect(compareReceipts(receipt(), receipt())).toEqual({
      equal: true,
      sections: [],
      tables: [],
    });
    const changed = receipt({
      sections: { ...receipt().sections, content: "c2" },
      tables: { ...receipt().tables, topics: { rows: 2, sha256: "t2" } },
    });
    expect(compareReceipts(receipt(), changed)).toEqual({
      equal: false,
      sections: ["content"],
      tables: ["topics"],
    });
  });

  it("reports a missing or extra table even when section digests were forged equal", () => {
    const extra = receipt({ tables: { ...receipt().tables, shadow: { rows: 0, sha256: "z" } } });
    expect(compareReceipts(receipt(), extra)).toMatchObject({ equal: false, tables: ["shadow"] });
  });

  it("accepts only pre-declared section differences, never table content differences", () => {
    const owners = receipt({ sections: { ...receipt().sections, security: "a2" } });
    expect(compareReceipts(receipt(), owners, ["security"]).equal).toBe(true);
    expect(compareReceipts(receipt(), owners).equal).toBe(false);
    const content = receipt({ tables: { ...receipt().tables, entries: { rows: 4, sha256: "e" } } });
    expect(compareReceipts(receipt(), content, ["content"]).equal).toBe(false);
  });
});
