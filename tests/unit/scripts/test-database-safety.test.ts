import { describe, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../../../scripts/test-database-safety";

describe("destructive test database guard", () => {
  it("accepts only PostgreSQL database names dedicated to tests", () => {
    for (const url of [
      "postgresql://postgres:postgres@127.0.0.1:5432/test",
      "postgresql://postgres:postgres@127.0.0.1:5432/agent_sozluk_m1_test?schema=public",
      "postgresql://postgres:postgres@127.0.0.1:5432/agent-sozluk-test",
    ]) {
      expect(requireTestDatabaseUrl(url, "Unit test")).toBe(url);
    }
  });

  it("rejects missing, malformed, non-PostgreSQL and ambiguous database targets", () => {
    for (const url of [
      undefined,
      "not-a-url",
      "postgres://postgres:postgres@127.0.0.1:5432/agent_sozluk_test",
      "mysql://root@127.0.0.1/agent_sozluk_test",
      "postgresql://postgres:postgres@127.0.0.1:5432/agent_sozluk",
      "postgresql://postgres:postgres@127.0.0.1:5432/test_backup",
      "postgresql://postgres:postgres@127.0.0.1:5432/contest?schema=test",
    ]) {
      expect(() => requireTestDatabaseUrl(url, "Unit test")).toThrow();
    }
  });
});

describe("çok parçalı yol", () => {
  /*
    7 Eylül 2026'da gerçekten oldu: `postgresql://host/agentsz_uiux_dev/agent_sozluk_m1_test`
    korumadan GEÇTİ (metin `_test` ile bitiyor) ama Prisma İLK parçaya bağlandı ve
    entegrasyon testleri `agentsz_uiux_dev` geliştirme veritabanını temizledi.

    Aynı kalıp üretimi de hedefleyebilirdi: `.../agent_sozluk/x_test` korumadan geçip
    üretim veritabanına bağlanırdı. `psql` bu adresi reddediyor, Prisma kabul ediyor —
    koruma metne değil, istemcinin ÇÖZDÜĞÜ ada bakmalı.
  */
  it("ilk parçası gerçek veritabanı olan adresi reddeder", () => {
    expect(() =>
      requireTestDatabaseUrl(
        "postgresql://u:p@localhost:5432/agentsz_uiux_dev/agent_sozluk_m1_test",
        "Unit test",
      ),
    ).toThrow(/multi-segment/u);
  });

  it("üretim adını gizleyen aynı kalıbı da reddeder", () => {
    expect(() =>
      requireTestDatabaseUrl("postgresql://u:p@db/agent_sozluk/scratch_test", "Unit test"),
    ).toThrow(/multi-segment/u);
  });

  it("tek parçalı geçerli adresi kabul eder", () => {
    const url = "postgresql://u:p@localhost:5432/agent_sozluk_m1_test";
    expect(requireTestDatabaseUrl(url, "Unit test")).toBe(url);
  });
});
