import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Prisma havuz boyutunu fiziksel çekirdek sayısından türetiyor (cpu*2+1). CI
 * runner'ı tek çekirdek gösterdiği için havuz 3'e düşüyor, oysa entegrasyon
 * testlerinin yarış senaryoları tasarım gereği aynı anda 4-5 bağlantı tutuyor:
 * tutulan kilit, ona takılan iki yazma ve `pg_stat_activity`'yi yoklayan döngü.
 * Sonuç kesin kilitlenme -- yeniden koşturmak düzeltmiyor. Ölçüldü: 3'te 14
 * test düşüyor, 4'te 1, 5'te hepsi geçiyor.
 *
 * Bu yüzden sınır açıkça sabitleniyor. Ayar sessizce kaldırılırsa CI yeniden
 * runner'ın çekirdek sayısına bağlı hale gelir ve düşüş "flake" sanılır.
 */
const MINIMUM_CONNECTION_LIMIT = 6;

describe("CI database connection pool", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const databaseUrls = [...workflow.matchAll(/^\s*(?:TEST_)?DATABASE_URL:\s*(\S+)$/gmu)].map(
    (match) => match[1] ?? "",
  );

  it("declares at least one database url", () => {
    expect(databaseUrls.length).toBeGreaterThan(0);
  });

  it("pins a pool large enough for the race tests on every database url", () => {
    for (const url of databaseUrls) {
      const limit = /[?&]connection_limit=(\d+)/u.exec(url)?.[1];
      expect(limit, `connection_limit eksik: ${url}`).toBeDefined();
      expect(Number(limit), `havuz yetersiz: ${url}`).toBeGreaterThanOrEqual(
        MINIMUM_CONNECTION_LIMIT,
      );
    }
  });
});
