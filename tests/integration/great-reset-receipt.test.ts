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

async function identity() {
  const [row] = await integrationDatabase.$queryRaw<{ cluster: string; owner: string }[]>`
    SELECT (SELECT system_identifier::text FROM pg_control_system()) AS cluster,
      current_user AS owner`;
  return { clusterId: row!.cluster, owner: row!.owner };
}

describe("great reset receipt against PostgreSQL", () => {
  beforeEach(resetIntegrationDatabase);
  afterAll(closeIntegrationDatabase);

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
});
