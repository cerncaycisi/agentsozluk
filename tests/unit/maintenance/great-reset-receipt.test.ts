import { describe, expect, it } from "vitest";
import {
  compareReceipts,
  type GreatResetReceipt,
} from "@/modules/maintenance/repository/great-reset-receipt";

function receipt(change: (value: GreatResetReceipt) => void = () => undefined): GreatResetReceipt {
  const value: GreatResetReceipt = {
    version: 2,
    sha256: "x",
    sections: { content: "c", sequences: "q", schema: "s", security: "a", database: "d" },
    tables: { topics: { rows: 2, sha256: "t" }, entries: { rows: 3, sha256: "e" } },
    details: {
      sequences: { topics_public_id_seq: "q1" },
      security: { "relation:topics": '["r","agent_sozluk",null,false,false]' },
      database: { comment: "null" },
    },
  };
  change(value);
  return value;
}

describe("great reset receipt comparison", () => {
  it("is equal only when every section, table and detail matches", () => {
    expect(compareReceipts(receipt(), receipt()).equal).toBe(true);
    const changed = receipt((value) => {
      value.sections.content = "c2";
      value.tables.topics = { rows: 2, sha256: "t2" };
    });
    expect(compareReceipts(receipt(), changed)).toMatchObject({
      equal: false,
      sections: ["content"],
      tables: ["topics"],
    });
  });

  it("reports a missing or extra table, including one named __proto__", () => {
    const extra = receipt((value) => {
      value.tables = Object.fromEntries([
        ...Object.entries(value.tables),
        ["__proto__", { rows: 0, sha256: "z" }],
      ]) as GreatResetReceipt["tables"];
    });
    expect(compareReceipts(receipt(), extra)).toMatchObject({
      equal: false,
      tables: ["__proto__"],
    });
  });

  it("accepts only value-level expected differences and rejects any extra change", () => {
    const owner = receipt((value) => {
      value.sections.security = "a2";
      value.details.security["relation:topics"] = '["r","postgres",null,false,false]';
    });
    const allowed = [
      {
        section: "security" as const,
        key: "relation:topics",
        expected: '["r","agent_sozluk",null,false,false]',
        actual: '["r","postgres",null,false,false]',
      },
    ];
    expect(compareReceipts(receipt(), owner, allowed).equal).toBe(true);
    expect(compareReceipts(receipt(), owner).equal).toBe(false);
    // Aynı bölümde izinli sahiplik farkına ek bir GRANT eklenirse reddedilir.
    const ownerAndGrant = receipt((value) => {
      value.sections.security = "a3";
      value.details.security["relation:topics"] = '["r","postgres",null,false,false]';
      value.details.security["column:users.passwordHash"] = "{=r/postgres}";
    });
    expect(compareReceipts(receipt(), ownerAndGrant, allowed)).toMatchObject({
      equal: false,
      unexpected: [{ key: "column:users.passwordHash" }],
    });
  });

  it("never accepts a content or schema difference", () => {
    const schema = receipt((value) => {
      value.sections.schema = "s2";
    });
    expect(compareReceipts(receipt(), schema).equal).toBe(false);
  });
});
