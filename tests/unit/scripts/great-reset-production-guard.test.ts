import { describe, expect, it } from "vitest";
import {
  productionResetIdentity,
  productionResetTarget,
} from "@/modules/maintenance/domain/great-reset-production-guard";
import { localResetIdentities } from "@/modules/maintenance/domain/great-reset-local-guard";

// Değerler sahtedir; gerçek credential ya da adres içermez.
const sha = "a".repeat(40);
const valid = {
  hostname: "agent-sozluk-prod",
  envFileContents:
    '# yorum\nNODE_ENV=production\nDATABASE_URL="postgresql://agent_sozluk:placeholder@db:5432/agent_sozluk"\n',
  releaseDirectory: `${productionResetIdentity.releasesRoot}/${sha}`,
  releaseShaFileContents: `${sha}\n`,
  databaseAddress: "172.19.0.5",
};

describe("production great reset target guard", () => {
  it("derives the pinned target and the postgres control URL from the single DATABASE_URL", () => {
    const target = productionResetTarget(valid);
    expect(target.releaseSha).toBe(sha);
    expect(target.databaseName).toBe("agent_sozluk");
    const database = new URL(target.databaseUrl);
    expect(database.pathname).toBe("/agent_sozluk");
    expect(database.searchParams.get("connection_limit")).toBe("1");
    expect(database.searchParams.get("connect_timeout")).toBe("5");
    const control = new URL(target.controlUrl);
    expect(control.pathname).toBe("/postgres");
    expect(control.host).toBe(database.host);
    expect(control.username).toBe("agent_sozluk");
    // `.env`'deki Compose adı `db` değil, doğrulanmış container adresi kullanılır.
    expect(database.hostname).toBe("172.19.0.5");
    expect(control.hostname).toBe("172.19.0.5");
    expect(target.serverAddresses).toEqual(["172.19.0.5"]);
  });

  it("writes an IPv6 container address in brackets and rejects non-addresses", () => {
    const target = productionResetTarget({ ...valid, databaseAddress: "fd00::5" });
    expect(new URL(target.databaseUrl).hostname).toBe("[fd00::5]");
    expect(target.serverAddresses).toEqual(["fd00::5"]);
    for (const databaseAddress of ["db", "", "172.19.0", "[fd00::5]"])
      expect(() => productionResetTarget({ ...valid, databaseAddress })).toThrow(
        "GREAT_RESET_PRODUCTION_DATABASE_ADDRESS_INVALID",
      );
  });

  it("refuses any other host, including the local rehearsal hosts", () => {
    for (const hostname of ["agentic-server", "MacBook-Pro-26.local", "agent-sozluk-prod2", ""])
      expect(() => productionResetTarget({ ...valid, hostname })).toThrow(
        "GREAT_RESET_PRODUCTION_HOST_REQUIRED",
      );
    expect(localResetIdentities.map((row) => row.hostname)).not.toContain("agent-sozluk-prod");
  });

  it("requires the running release directory to match .release-sha", () => {
    for (const change of [
      { releaseShaFileContents: "b".repeat(40) },
      { releaseShaFileContents: "not-a-sha" },
      { releaseDirectory: `/tmp/${sha}` },
      { releaseDirectory: `${productionResetIdentity.releasesRoot}/${sha}/..` },
    ])
      expect(() => productionResetTarget({ ...valid, ...change })).toThrow(
        "GREAT_RESET_PRODUCTION_RELEASE_MISMATCH",
      );
  });

  it("rejects missing, duplicated or foreign DATABASE_URL values without echoing them", () => {
    for (const envFileContents of [
      "NODE_ENV=production\n",
      "DATABASE_URL=postgresql://agent_sozluk:x@db:5432/agent_sozluk\nDATABASE_URL=postgresql://agent_sozluk:x@db:5432/agent_sozluk\n",
      "DATABASE_URL=postgresql://postgres:x@db:5432/agent_sozluk\n",
      "DATABASE_URL=postgresql://agent_sozluk:x@db:5432/other\n",
      "DATABASE_URL=postgresql://agent_sozluk:x@db:5432/agent_sozluk?sslmode=disable\n",
      "DATABASE_URL=mysql://agent_sozluk:x@db:5432/agent_sozluk\n",
      "DATABASE_URL=not a url\n",
      // Başka bir çok satırlı değerin içindeki satır atama değildir (Astra, PR #231 P2).
      'NOTE="ilk satır\nDATABASE_URL=postgresql://agent_sozluk:x@db:5432/agent_sozluk\nson"\n',
      "DATABASE_URL=postgresql://agent_sozluk%ZZ:x@db:5432/agent_sozluk\n",
      "bu satır atama değil\nDATABASE_URL=postgresql://agent_sozluk:x@db:5432/agent_sozluk\n",
    ]) {
      let message = "";
      try {
        productionResetTarget({ ...valid, envFileContents });
      } catch (error) {
        message = error instanceof Error ? error.message : "";
      }
      expect(message).toBe("GREAT_RESET_PRODUCTION_DATABASE_URL_INVALID");
    }
  });

  it("accepts a trailing comment and a CRLF file with a multi-line value elsewhere", () => {
    const envFileContents =
      'KEY="-----BEGIN-----\r\nabc\r\n-----END-----"\r\n' +
      'DATABASE_URL="postgresql://agent_sozluk:p%40ss@db:5432/agent_sozluk" # yorum\r\n';
    const target = productionResetTarget({ ...valid, envFileContents });
    expect(new URL(target.controlUrl).password).toBe("p%40ss");
  });
});
