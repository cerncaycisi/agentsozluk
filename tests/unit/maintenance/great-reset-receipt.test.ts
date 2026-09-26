import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  compareReceipts,
  type GreatResetReceipt,
} from "@/modules/maintenance/repository/great-reset-receipt";

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const owner = JSON.stringify('["r","agent_sozluk",null,false,false]');
const postgresOwner = JSON.stringify('["r","postgres",null,false,false]');

/** Bölüm özetleri, gerçek makbuz gibi ayrıntılardan hesaplanır. */
function receipt(
  change: (value: GreatResetReceipt) => void = () => undefined,
  schema = sha("s"),
): GreatResetReceipt {
  const value: GreatResetReceipt = {
    version: 2,
    sha256: "",
    sections: { content: "", sequences: "", schema, security: "", database: "" },
    tables: { topics: { rows: 2, sha256: "t" }, entries: { rows: 3, sha256: "e" } },
    details: {
      sequences: { topics_public_id_seq: '"q1"' },
      security: { "relation:topics": owner },
      database: { comment: "null" },
    },
  };
  change(value);
  value.sections.content = sha(value.tables);
  value.sections.sequences = sha(value.details.sequences);
  value.sections.security = sha(value.details.security);
  value.sections.database = sha(value.details.database);
  value.sha256 = sha(value.sections);
  return value;
}

describe("great reset receipt comparison", () => {
  it("is equal only when every section, table and detail matches", () => {
    expect(compareReceipts(receipt(), receipt()).equal).toBe(true);
    const changed = receipt((value) => {
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
    const moved = receipt((value) => {
      value.details.security["relation:topics"] = postgresOwner;
    });
    const allowed = [
      {
        section: "security" as const,
        key: "relation:topics",
        expected: owner,
        actual: postgresOwner,
      },
    ];
    expect(compareReceipts(receipt(), moved, allowed).equal).toBe(true);
    expect(compareReceipts(receipt(), moved).equal).toBe(false);
    const movedAndGranted = receipt((value) => {
      value.details.security["relation:topics"] = postgresOwner;
      value.details.security["column:users.passwordHash"] = JSON.stringify("{=r/postgres}");
    });
    expect(compareReceipts(receipt(), movedAndGranted, allowed)).toMatchObject({
      equal: false,
      unexpected: [{ key: "column:users.passwordHash" }],
    });
  });

  it("never accepts a schema difference", () => {
    expect(compareReceipts(receipt(), receipt(undefined, sha("s2"))).equal).toBe(false);
  });

  it("rejects a section digest that does not match its own details", () => {
    const forged = receipt();
    forged.sections.security = sha("başka");
    forged.sha256 = sha(forged.sections);
    expect(compareReceipts(receipt(), forged).equal).toBe(false);
    expect(compareReceipts(forged, forged).equal).toBe(false);
  });

  it("rejects a receipt with a missing section in either direction", () => {
    const missing = receipt();
    delete (missing.sections as Partial<GreatResetReceipt["sections"]>).schema;
    missing.sha256 = sha(missing.sections);
    const other = receipt(undefined, sha("s2"));
    expect(compareReceipts(missing, other).equal).toBe(false);
    expect(compareReceipts(other, missing).equal).toBe(false);
    expect(compareReceipts(missing, missing).equal).toBe(false);
  });
});
