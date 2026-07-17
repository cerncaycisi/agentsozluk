import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface RequirementManifest {
  count: number;
  requirements: Array<{ id: string; sourceLine: number; summary: string }>;
}

const root = process.cwd();
const manifest = JSON.parse(
  readFileSync(path.join(root, "docs/m2-requirements.json"), "utf8"),
) as RequirementManifest;
const requirementsDocument = readFileSync(path.join(root, "docs/M2_REQUIREMENTS.md"), "utf8");
const traceabilityDocument = readFileSync(path.join(root, "docs/M2_TRACEABILITY.md"), "utf8");

const extractTableIds = (input: string): string[] =>
  Array.from(input.matchAll(/^\|\s*([A-Z][A-Z0-9-]*-\d{3})\s*\|/gmu), (match) => match[1]!);

describe("Milestone 2 requirement manifest", () => {
  it("contains exactly 543 unique owner-supplied IDs", () => {
    const ids = manifest.requirements.map(({ id }) => id);
    expect(manifest.count).toBe(543);
    expect(ids).toHaveLength(543);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps requirement and traceability rows aligned", () => {
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

  it("uses only explicit PASS, FAIL or BLOCKED statuses", () => {
    const statuses = Array.from(
      traceabilityDocument.matchAll(/^\|\s*[A-Z][A-Z0-9-]*-\d{3}\s*\|.*\|\s*([A-Z]+)\s*\|$/gmu),
      (match) => match[1]!,
    );

    expect(statuses).toHaveLength(manifest.count);
    expect(statuses.every((status) => ["PASS", "FAIL", "BLOCKED"].includes(status))).toBe(true);
  });
});
