import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface RequirementManifest {
  count: number;
  requirements: Array<{ id: string; sourceLine: number; summary: string }>;
}

const root = process.cwd();
const manifest = JSON.parse(
  readFileSync(path.join(root, "docs/requirements.json"), "utf8"),
) as RequirementManifest;
const requirementsDocument = readFileSync(path.join(root, "docs/M1_REQUIREMENTS.md"), "utf8");
const traceabilityDocument = readFileSync(path.join(root, "docs/TRACEABILITY.md"), "utf8");

const extractTableIds = (input: string): string[] =>
  Array.from(input.matchAll(/^\|\s*([A-Z][A-Z0-9-]*-\d{3})\s*\|/gmu), (match) => match[1]!);

describe("Milestone 1 requirement traceability", () => {
  it("contains exactly 811 unique manifest IDs", () => {
    const ids = manifest.requirements.map(({ id }) => id);
    expect(manifest.count).toBe(811);
    expect(ids).toHaveLength(811);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the requirement and traceability documents aligned with the manifest", () => {
    const manifestIds = manifest.requirements.map(({ id }) => id).sort();
    const requirementIds = extractTableIds(requirementsDocument);
    const traceabilityIds = extractTableIds(traceabilityDocument);

    expect(requirementIds).toHaveLength(manifestIds.length);
    expect(traceabilityIds).toHaveLength(manifestIds.length);
    expect(new Set(requirementIds).size).toBe(requirementIds.length);
    expect(new Set(traceabilityIds).size).toBe(traceabilityIds.length);
    expect([...requirementIds].sort()).toEqual(manifestIds);
    expect([...traceabilityIds].sort()).toEqual(manifestIds);
  });

  it("has no FAIL or BLOCKED final status", () => {
    expect(traceabilityDocument).not.toMatch(/\|\s*(?:FAIL|BLOCKED)\s*\|\s*$/mu);
  });
});
