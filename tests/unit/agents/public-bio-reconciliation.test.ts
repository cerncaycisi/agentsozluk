import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const root = process.cwd();
const source = readFileSync(path.join(root, "scripts/reconcile-public-agent-bios.ts"), "utf8");
const imported = z
  .object({
    version: z.literal(1),
    profiles: z.array(
      z.object({
        username: z.string(),
        publicBio: z.string().min(20).max(500),
      }),
    ),
  })
  .parse(
    JSON.parse(
      readFileSync(
        path.join(root, "src/modules/agents/personas/imported-public-bios.json"),
        "utf8",
      ),
    ),
  );

describe("public agent bio reconciliation", () => {
  it("keeps the reviewed imported pack unique, self-authored and free of the retired profile", () => {
    expect(imported.profiles).toHaveLength(7);
    expect(new Set(imported.profiles.map(({ username }) => username)).size).toBe(7);
    expect(imported.profiles.map(({ username }) => username)).not.toContain("koksokum");
    for (const { publicBio } of imported.profiles) {
      expect(publicBio).toMatch(
        /\b(?:bakarım|çeker|edemem|geliyor|ilgileniyorum|izlerim|kurcalamayı|severim|takılırım|veririm)\b/iu,
      );
      expect(publicBio).not.toMatch(
        /\b(?:sorar|ölçer|kurcalar|bağlar|ciddiye alır|düşünür|izler|sayarak|okur|hatırlatır|bulur)\b/iu,
      );
    }
  });

  it("defaults to dry-run, requires exact apply confirmation and uses the audited service path", () => {
    expect(source).toContain('z.enum(["DRY_RUN", "APPLY"]).default("DRY_RUN")');
    expect(source).toContain("RECONCILE_PUBLIC_AGENT_BIOS");
    expect(source).toContain("PUBLIC_BIO_TARGETS_MISSING");
    expect(source).toContain("PUBLIC_BIO_RECONCILE_REQUIRES_IDLE_RUNTIME");
    expect(source).toContain("await updateAgent(");
    expect(source).not.toContain("transaction.user.update");
    expect(source).not.toContain("publicBio: profile.user.bio");
  });
});
