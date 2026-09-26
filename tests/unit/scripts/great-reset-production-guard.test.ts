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
});
