import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import originalPersonaPack from "../../../src/modules/agents/personas/original-personas.json";
import {
  assignVerifiedSources,
  reconciledCanonicalAdminPinned,
  sourceTopicMappings,
  uniqueVerifiedSourcePool,
} from "../../../src/modules/agents/personas/source-assignment";
import {
  seedPersonaPackSchema,
  type SeedPersona,
} from "../../../src/modules/agents/personas/schema";

const pack = seedPersonaPackSchema.parse(originalPersonaPack);
const verifiedPool = uniqueVerifiedSourcePool(pack.personas);
const base = pack.personas[0]!;
const unverifiedSource = {
  ...base.sources[0]!,
  url: "https://unverified.example/feed",
};
const importedPersona: SeedPersona = {
  ...base,
  username: "imported_writer",
  sources: [...base.sources.slice(0, 4), unverifiedSource],
  sourceTopicMappings: sourceTopicMappings([...base.sources.slice(0, 4), unverifiedSource]),
};

describe("verified source assignment", () => {
  it("deterministically retains verified sources, drops unknown URLs and keeps two-source headroom", () => {
    const first = assignVerifiedSources(importedPersona, verifiedPool);
    const second = assignVerifiedSources(importedPersona, [...verifiedPool].reverse());
    const urls = new Set(first.map(({ url }) => url));

    expect(first).toEqual(second);
    expect(first).toHaveLength(12);
    expect(urls.has(unverifiedSource.url)).toBe(false);
    for (const { url } of base.sources.slice(0, 4)) expect(urls.has(url)).toBe(true);
    expect(new Set(first.map(({ url }) => new URL(url).origin)).size).toBe(12);
    expect(Object.keys(sourceTopicMappings(first))).toEqual(first.map(({ url }) => url));
  });

  it("fails closed when the verified pool cannot satisfy the minimum", () => {
    expect(() => assignVerifiedSources(importedPersona, verifiedPool.slice(0, 9))).toThrow(
      "SOURCE_ASSIGNMENT_POOL_TOO_SMALL",
    );
  });

  it("preserves existing runtime reliability history during source reconciliation", () => {
    const reconcileSource = readFileSync("scripts/reconcile-persona-sources.ts", "utf8");

    expect(reconcileSource).not.toContain("consecutiveFailures: 0");
    expect(reconcileSource).not.toContain("lastFetchedAt: null");
    expect(reconcileSource).not.toMatch(/update:\s*\{[\s\S]*?adminBlocked:\s*false/u);
    expect(reconcileSource).toMatch(
      /update:\s*\{[\s\S]*?adminPinned:\s*reconciledCanonicalAdminPinned\(before, source\.pinned\)/u,
    );
    expect(reconcileSource).toContain("await updateAgent(transaction");
    expect(reconcileSource).not.toContain("await updateAgent(database");
    expect(reconcileSource.indexOf("await requireAgentAdminInTransaction")).toBeLessThan(
      reconcileSource.indexOf("await lockAgentProfile"),
    );
    expect(reconcileSource.indexOf("await lockAgentProfile")).toBeLessThan(
      reconcileSource.indexOf("const currentProfile = await transaction.agentProfile"),
    );
    expect(
      reconcileSource.indexOf("const currentProfile = await transaction.agentProfile"),
    ).toBeLessThan(reconcileSource.indexOf("const currentPersona = seedPersonaSchema.parse"));
  });

  it("never pins a source while preserving an existing administrative block", () => {
    expect(reconciledCanonicalAdminPinned({ adminBlocked: true, status: "BLOCKED" }, true)).toBe(
      false,
    );
    expect(reconciledCanonicalAdminPinned({ adminBlocked: false, status: "BLOCKED" }, true)).toBe(
      false,
    );
    expect(reconciledCanonicalAdminPinned({ adminBlocked: false, status: "SEED" }, true)).toBe(
      true,
    );
    expect(reconciledCanonicalAdminPinned(null, true)).toBe(true);
  });
});
