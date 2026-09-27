import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  compareForIndependentRestore,
  compareLiveWithRestored,
  type GreatResetReceipt,
} from "../../../src/modules/maintenance/repository/great-reset-receipt";

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

type Parts = {
  tables: GreatResetReceipt["tables"];
  schema: string;
  schemaNormalized?: string;
  details: GreatResetReceipt["details"];
};

// Bölüm özetleri ayrıntılardan hesaplanır: makbuz iç tutarlıdır.
function receipt(parts: Parts): GreatResetReceipt {
  const sections = {
    content: sha256(parts.tables),
    sequences: sha256(parts.details.sequences),
    schema: parts.schema,
    schemaNormalized: parts.schemaNormalized ?? parts.schema,
    security: sha256(parts.details.security),
    database: sha256(parts.details.database),
  };
  return {
    version: 3,
    sha256: sha256(sections),
    sections,
    tables: parts.tables,
    details: parts.details,
  };
}

const base: Parts = {
  tables: { users: { rows: 3, sha256: "a".repeat(64) } },
  schema: "b".repeat(64),
  details: {
    sequences: { entries_public_id_seq: "[2147483648,false]" },
    security: {
      "relation:users": '["r","agent_sozluk",null,false,false]',
      "role:agent_sozluk": "[false,false]",
      "extensionMember:type gtrgm": '["postgres",null]',
    },
    database: { locale: '["UTF8","en_US.utf8"]', comment: "null" },
  },
};

function variant(change: (parts: Parts) => void): GreatResetReceipt {
  const copy = structuredClone(base);
  change(copy);
  return receipt(copy);
}

describe("bağımsız restore karşılaştırması", () => {
  it("küme ve veritabanı ortam farklarını raporlar ama engellemez", () => {
    const result = compareForIndependentRestore(
      receipt(base),
      variant((parts) => {
        parts.details.security["role:agent"] = "[true,true]";
        parts.details.security["extensionMember:type gtrgm"] = '["agent",null]';
        parts.details.database.locale = '["UTF8","C.UTF-8"]';
        parts.details.database.comment = '"agentsozluk:great-reset:synthetic:v1"';
      }),
    );
    expect(result.equal).toBe(true);
    expect(result.blocking).toEqual([]);
    expect(result.environment).toEqual(
      expect.arrayContaining([
        "security:role:agent",
        "security:extensionMember:type gtrgm",
        "database:locale",
        "database:comment",
      ]),
    );
  });

  it("nesne sahipliği/yetkisi, içerik, şema ve sequence farkı engeller", () => {
    const owner = compareForIndependentRestore(
      receipt(base),
      variant((parts) => {
        parts.details.security["relation:users"] = '["r","agent",null,false,false]';
      }),
    );
    expect(owner.blocking).toEqual(["security:relation:users"]);
    const content = compareForIndependentRestore(
      receipt(base),
      variant((parts) => {
        parts.tables.users = { rows: 2, sha256: "c".repeat(64) };
      }),
    );
    expect(content.blocking).toEqual(["section:content", "table:users"]);
    const schema = compareForIndependentRestore(
      receipt(base),
      variant((parts) => {
        parts.schema = "d".repeat(64);
      }),
    );
    expect(schema.blocking).toEqual(["section:schema", "section:schemaNormalized"]);
    const sequence = compareForIndependentRestore(
      receipt(base),
      variant((parts) => {
        parts.details.sequences.entries_public_id_seq = "[2147483649,true]";
      }),
    );
    expect(sequence.blocking).toEqual(["section:sequences", "sequences:entries_public_id_seq"]);
  });

  it("iç tutarsız makbuzu reddeder", () => {
    const tampered = receipt(base);
    tampered.details.security["relation:users"] = '["r","agent",null,false,false]';
    const result = compareForIndependentRestore(receipt(base), tampered);
    expect(result.blocking).toContain("receipt:independent-inconsistent");
  });
  it("canlı ↔ restore: ham şema farkı yalnız kanonik şema eşitse kabul edilir", () => {
    const restored = variant((parts) => {
      parts.schema = "e".repeat(64);
      parts.schemaNormalized = "b".repeat(64);
    });
    expect(compareLiveWithRestored(receipt(base), restored).equal).toBe(true);
    const lost = variant((parts) => {
      parts.schema = "e".repeat(64);
      parts.schemaNormalized = "f".repeat(64);
    });
    expect(compareLiveWithRestored(receipt(base), lost)).toMatchObject({
      equal: false,
      sections: ["schemaNormalized"],
    });
  });
});
