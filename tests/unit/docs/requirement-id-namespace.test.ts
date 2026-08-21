import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");

interface RequirementManifest {
  count?: number;
  requirements: Array<{ id: string }>;
}

function manifestIds(relativePath: string): string[] {
  const manifest = JSON.parse(
    readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
  ) as RequirementManifest;
  return manifest.requirements.map((requirement) => requirement.id);
}

// Aynı çıplak ID iki milestone'da farklı anlama gelemez: M1 çıplak formu sahiplenir,
// çakışan M2 requirement'ları `M2-` ad alanını taşır.
describe("requirement ID namespace", () => {
  const milestoneOneIds = manifestIds("docs/requirements.json");
  const milestoneTwoIds = manifestIds("docs/m2-requirements.json");

  it("keeps both manifests non-empty and duplicate free", () => {
    expect(milestoneOneIds.length).toBeGreaterThan(0);
    expect(milestoneTwoIds.length).toBeGreaterThan(0);
    expect(new Set(milestoneOneIds).size).toBe(milestoneOneIds.length);
    expect(new Set(milestoneTwoIds).size).toBe(milestoneTwoIds.length);
  });

  it("shares no requirement ID between milestone 1 and milestone 2", () => {
    const milestoneOne = new Set(milestoneOneIds);
    const shared = milestoneTwoIds.filter((id) => milestoneOne.has(id)).sort();
    expect(
      shared,
      [
        "Bu ID'ler hem docs/requirements.json hem docs/m2-requirements.json içinde ve",
        "farklı anlamlara geliyor. Çakışan M2 requirement'ına `M2-` ad alanını verin:",
        ...shared.map((id) => `  ${id} -> M2-${id}`),
      ].join("\n"),
    ).toEqual([]);
  });

  it("never namespaces a milestone 1 ID", () => {
    expect(milestoneOneIds.filter((id) => id.startsWith("M2-"))).toEqual([]);
  });

  it("only namespaces milestone 2 IDs that would otherwise collide", () => {
    const milestoneOne = new Set(milestoneOneIds);
    const unnecessary = milestoneTwoIds
      .filter((id) => id.startsWith("M2-"))
      .filter((id) => !milestoneOne.has(id.slice("M2-".length)))
      .sort();
    expect(
      unnecessary,
      `Bu M2 ID'lerinin çıplak formu M1'de yok; ad alanı gereksiz:\n${unnecessary.join("\n")}`,
    ).toEqual([]);
  });
});
