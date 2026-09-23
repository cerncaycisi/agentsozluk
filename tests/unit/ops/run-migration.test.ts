import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.join(process.cwd(), "scripts/run-migration.mjs");

function targetUrl(databaseUrl: string, target: string, applicationName?: string): string {
  return execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { targetDatabaseUrl } = await import(${JSON.stringify(script)});
       try { process.stdout.write(targetDatabaseUrl(process.argv[1], process.argv[2], process.argv[3])); }
       catch (error) { process.stdout.write("ERR:" + error.message); }`,
      databaseUrl,
      target,
      ...(applicationName === undefined ? [] : [applicationName]),
    ],
    { encoding: "utf8" },
  );
}

describe("A5 migration yürütücüsünün hedef seçimi", () => {
  it("yalnız veritabanı adını değiştirir; kullanıcı, parola, sunucu ve sorgu parametreleri kalır", () => {
    expect(
      targetUrl(
        "postgresql://agent_sozluk:gizli@db:5432/agent_sozluk?schema=public&connection_limit=5",
        "agent_sozluk_a5_20260923_101500_ab12cd",
      ),
    ).toBe(
      "postgresql://agent_sozluk:gizli@db:5432/agent_sozluk_a5_20260923_101500_ab12cd?schema=public&connection_limit=5",
    );
  });

  it("operasyon kimliğini application_name olarak ekler, kalıba uymayanı reddeder", () => {
    expect(
      targetUrl("postgresql://u:p@db:5432/agent_sozluk", "agent_sozluk", "a5-0123456789abcdef"),
    ).toBe("postgresql://u:p@db:5432/agent_sozluk?application_name=a5-0123456789abcdef");
    expect(targetUrl("postgresql://u:p@db:5432/agent_sozluk", "agent_sozluk", "app&x=1")).toBe(
      "ERR:A5_APPLICATION_NAME_INVALID",
    );
  });

  it("güvenli kalıba uymayan hedef adını ve başka protokolü reddeder", () => {
    for (const target of ["", "Agent", "agent_sozluk; drop", "../x", "a".repeat(64)]) {
      expect(targetUrl("postgresql://u:p@db:5432/agent_sozluk", target), target).toBe(
        "ERR:A5_TARGET_DATABASE_INVALID",
      );
    }
    expect(targetUrl("mysql://u:p@db:3306/agent_sozluk", "agent_sozluk")).toBe(
      "ERR:DATABASE_URL_PROTOCOL_INVALID",
    );
  });
});
