import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  compareReceipts,
  computeReceipt,
} from "../../src/modules/maintenance/repository/great-reset-receipt";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

/*
  Kasıtlı bozma adımları (dil/parametre yetkisi, extension üyesi operatör) nesne sahibi yönetici
  rolü ister. Makbuzun kendisi her zaman test rolüyle (CI'da süper kullanıcı olmayan DB sahibi,
  tasarım v20 madde 6) hesaplanır; yönetici yalnız fixture'ı kurar ve geri alır.
*/
const fixtureAdmin = (() => {
  const base = process.env.TEST_ADMIN_DATABASE_URL;
  if (!base) return integrationDatabase;
  const url = new URL(base);
  const target = new URL(
    process.env.TEST_DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/agent_sozluk_test",
  );
  url.pathname = target.pathname;
  url.search = "";
  url.searchParams.set("connection_limit", "2");
  return new PrismaClient({ datasourceUrl: url.toString(), log: [] });
})();

async function identity() {
  const [row] = await integrationDatabase.$queryRaw<{ cluster: string; owner: string }[]>`
    SELECT (SELECT system_identifier::text FROM pg_control_system()) AS cluster,
      current_user AS owner`;
  return { clusterId: row!.cluster, owner: row!.owner };
}

describe("great reset receipt against PostgreSQL", () => {
  beforeEach(resetIntegrationDatabase);
  afterAll(async () => {
    if (fixtureAdmin !== integrationDatabase) await fixtureAdmin.$disconnect();
    await closeIntegrationDatabase();
  });

  it("is deterministic and separates SQL NULL from JSON null, even with a column named t", async () => {
    const expected = await identity();
    await integrationDatabase.$executeRaw`CREATE TABLE zz_receipt_probe (t int, doc jsonb, payload text)`;
    try {
      await integrationDatabase.$executeRaw`INSERT INTO zz_receipt_probe VALUES (7, NULL, 'A')`;
      const first = await computeReceipt(integrationDatabase, expected);
      const second = await computeReceipt(integrationDatabase, expected);
      expect(compareReceipts(first, second).equal).toBe(true);
      expect(Object.keys(first.tables)).toContain("topics");

      await integrationDatabase.$executeRaw`UPDATE zz_receipt_probe SET doc = 'null'::jsonb`;
      const jsonNull = await computeReceipt(integrationDatabase, expected);
      expect(compareReceipts(first, jsonNull)).toMatchObject({
        equal: false,
        tables: ["zz_receipt_probe"],
      });

      // `t` sütunu aynı kalırken başka sütunun değişmesi de görünür (Astra, 2. tur P1).
      await integrationDatabase.$executeRaw`UPDATE zz_receipt_probe SET doc = NULL, payload = 'B'`;
      const payload = await computeReceipt(integrationDatabase, expected);
      expect(compareReceipts(first, payload)).toMatchObject({
        equal: false,
        tables: ["zz_receipt_probe"],
      });
    } finally {
      await integrationDatabase.$executeRaw`DROP TABLE IF EXISTS zz_receipt_probe`;
    }
  });

  it("refuses to run against an unexpected cluster", async () => {
    const expected = await identity();
    await expect(
      computeReceipt(integrationDatabase, { ...expected, clusterId: "0" }),
    ).rejects.toThrow("GREAT_RESET_DATABASE_IDENTITY_MISMATCH");
  });

  it("refuses unsupported user types instead of silently skipping them", async () => {
    const expected = await identity();
    await computeReceipt(integrationDatabase, expected);
    await integrationDatabase.$executeRaw`CREATE TYPE zz_receipt_range AS RANGE (subtype = int4)`;
    try {
      await expect(computeReceipt(integrationDatabase, expected)).rejects.toThrow(
        "GREAT_RESET_RECEIPT_SCOPE_UNSUPPORTED",
      );
    } finally {
      await integrationDatabase.$executeRaw`DROP TYPE IF EXISTS zz_receipt_range`;
    }
  });

  it("sees a change in an extension member type's ACL", async () => {
    const expected = await identity();
    const [trgm] = await integrationDatabase.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM pg_type
      WHERE typname = 'gtrgm' AND typnamespace = 'public'::regnamespace`;
    if (trgm?.count !== 1) return;
    const before = await computeReceipt(integrationDatabase, expected);
    await fixtureAdmin.$executeRawUnsafe("REVOKE USAGE ON TYPE gtrgm FROM PUBLIC");
    try {
      const after = await computeReceipt(integrationDatabase, expected);
      const result = compareReceipts(before, after);
      expect(result.equal).toBe(false);
      // Hem public tip anahtarı hem extension üyesi anahtarı; ikisi de değer düzeyinde security.
      expect(result.sections).toEqual(["security"]);
      expect(result.unexpected.map((item) => item.key)).toEqual(
        expect.arrayContaining(["type:gtrgm", "extensionMember:type gtrgm"]),
      );
    } finally {
      await fixtureAdmin.$executeRawUnsafe("GRANT USAGE ON TYPE gtrgm TO PUBLIC");
    }
  });

  it("refuses a user aggregate and sees a disabled rule", async () => {
    const expected = await identity();
    await integrationDatabase.$executeRawUnsafe(
      "CREATE AGGREGATE zz_receipt_probe(integer) (SFUNC = pg_catalog.int4pl, STYPE = integer, INITCOND = '0')",
    );
    try {
      await expect(computeReceipt(integrationDatabase, expected)).rejects.toThrow(
        "GREAT_RESET_RECEIPT_SCOPE_UNSUPPORTED",
      );
    } finally {
      await integrationDatabase.$executeRawUnsafe(
        "DROP AGGREGATE IF EXISTS zz_receipt_probe(integer)",
      );
    }
    await integrationDatabase.$executeRawUnsafe("CREATE TABLE zz_rule_probe (x int)");
    try {
      await integrationDatabase.$executeRawUnsafe(
        "CREATE RULE zz_block_delete AS ON DELETE TO zz_rule_probe DO INSTEAD NOTHING",
      );
      const enabled = await computeReceipt(integrationDatabase, expected);
      await integrationDatabase.$executeRawUnsafe(
        "ALTER TABLE zz_rule_probe DISABLE RULE zz_block_delete",
      );
      const disabled = await computeReceipt(integrationDatabase, expected);
      expect(compareReceipts(enabled, disabled)).toMatchObject({
        equal: false,
        sections: ["schema", "schemaNormalized"],
      });
    } finally {
      await integrationDatabase.$executeRawUnsafe("DROP TABLE IF EXISTS zz_rule_probe");
    }
  });

  it("refuses a user operator (any unsummarised object class)", async () => {
    const expected = await identity();
    await integrationDatabase.$executeRawUnsafe(
      "CREATE OPERATOR === (LEFTARG = integer, RIGHTARG = integer, FUNCTION = pg_catalog.int4eq)",
    );
    try {
      await expect(computeReceipt(integrationDatabase, expected)).rejects.toThrow(
        "GREAT_RESET_RECEIPT_SCOPE_UNSUPPORTED",
      );
    } finally {
      await integrationDatabase.$executeRawUnsafe("DROP OPERATOR IF EXISTS === (integer, integer)");
    }
    await computeReceipt(integrationDatabase, expected);
  });

  it("sees language usage and parameter privilege changes", async () => {
    const expected = await identity();
    const before = await computeReceipt(integrationDatabase, expected);
    await fixtureAdmin.$executeRawUnsafe("REVOKE USAGE ON LANGUAGE plpgsql FROM PUBLIC");
    await fixtureAdmin.$executeRawUnsafe(
      "GRANT SET ON PARAMETER session_replication_role TO PUBLIC",
    );
    try {
      const after = await computeReceipt(integrationDatabase, expected);
      const keys = compareReceipts(before, after).unexpected.map((item) => item.key);
      expect(keys).toEqual(
        expect.arrayContaining(["language:plpgsql", "parameter:session_replication_role"]),
      );
    } finally {
      await fixtureAdmin.$executeRawUnsafe("GRANT USAGE ON LANGUAGE plpgsql TO PUBLIC");
      await fixtureAdmin.$executeRawUnsafe(
        "REVOKE SET ON PARAMETER session_replication_role FROM PUBLIC",
      );
    }
  });

  it("sees a customised extension member operator and an index column statistics target", async () => {
    const expected = await identity();
    const [trgm] = await integrationDatabase.$queryRaw<{ count: number; restrict: string }[]>`
      SELECT count(*)::int AS count, max(oprrest::regproc::text) AS restrict FROM pg_operator
      WHERE oprname = '%' AND oprleft = 'text'::regtype AND oprright = 'text'::regtype`;
    const before = await computeReceipt(integrationDatabase, expected);
    if (trgm?.count === 1) {
      await fixtureAdmin.$executeRawUnsafe("ALTER OPERATOR % (text, text) SET (RESTRICT = NONE)");
      try {
        const after = await computeReceipt(integrationDatabase, expected);
        expect(compareReceipts(before, after)).toMatchObject({
          equal: false,
          sections: ["schema", "schemaNormalized"],
        });
      } finally {
        await fixtureAdmin.$executeRawUnsafe(
          `ALTER OPERATOR % (text, text) SET (RESTRICT = ${trgm.restrict})`,
        );
      }
      const restored = await computeReceipt(integrationDatabase, expected);
      expect(compareReceipts(before, restored).equal).toBe(true);
    }
    const [index] = await integrationDatabase.$queryRaw<{ name: string }[]>`
      SELECT c.relname AS name FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_class t ON t.oid = i.indrelid
      WHERE t.relnamespace = 'public'::regnamespace AND i.indexprs IS NOT NULL LIMIT 1`;
    if (index) {
      await integrationDatabase.$executeRawUnsafe(
        `ALTER INDEX "${index.name}" ALTER COLUMN 1 SET STATISTICS 1000`,
      );
      try {
        const after = await computeReceipt(integrationDatabase, expected);
        expect(compareReceipts(before, after)).toMatchObject({
          equal: false,
          sections: ["schema", "schemaNormalized"],
        });
      } finally {
        await integrationDatabase.$executeRawUnsafe(
          `ALTER INDEX "${index.name}" ALTER COLUMN 1 SET STATISTICS -1`,
        );
      }
    }
  });
});
