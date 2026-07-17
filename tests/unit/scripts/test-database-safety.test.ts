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
