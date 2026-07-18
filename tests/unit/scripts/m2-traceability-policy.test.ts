import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkM2Traceability,
  M2_DEVELOPMENT_BLOCKER_IDS,
  M2_DEVELOPMENT_BLOCKERS,
  type RequirementManifest,
} from "../../../scripts/m2-traceability-policy";

const root = process.cwd();
const manifest = JSON.parse(
  readFileSync(path.join(root, "docs/m2-requirements.json"), "utf8"),
) as RequirementManifest;
const expectedBlockerIds = [
  "DONE-034",
  "DONE-037",
  "DONE-038",
  "DONE-072",
  "DONE-073",
  "DONE-074",
  "DONE-075",
  "DONE-076",
  "DONE-077",
  "DONE-078",
  "DONE-079",
  "DONE-082",
  "DONE-084",
  "RUNTIME-001",
  "RUNTIME-002",
  "RUNTIME-003",
  "RUNTIME-004",
  "RUNTIME-006",
  "RUNTIME-007",
  "V1-007",
];

function requirementsDocument(): string {
  return manifest.requirements.map(({ id }) => `| ${id} | requirement |`).join("\n");
}

function traceabilityDocument(statuses: ReadonlyMap<string, string> = new Map()): string {
  return manifest.requirements
    .map(
      ({ id }) =>
        `| ${id} | concrete implementation | direct validation | ${statuses.get(id) ?? "PASS"} |`,
    )
    .join("\n");
}

describe("Milestone 2 staged traceability policy", () => {
  it("freezes a narrow, source-linked post-merge blocker allowlist", () => {
    expect(M2_DEVELOPMENT_BLOCKER_IDS).toEqual(expectedBlockerIds);

    const requirementsById = new Map(
      manifest.requirements.map((requirement) => [requirement.id, requirement]),
    );
    for (const id of expectedBlockerIds) {
      const policy = M2_DEVELOPMENT_BLOCKERS[id as keyof typeof M2_DEVELOPMENT_BLOCKERS];
      expect(requirementsById.get(id)?.sourceLine, id).toBe(policy.sourceLine);
      expect(policy.rationale.length, id).toBeGreaterThan(30);
    }
  });

  it("allows only the explicit post-merge IDs to remain BLOCKED in development", () => {
    const blockedId = "DONE-075";
    expect(
      checkM2Traceability({
        manifest,
        requirementsDocument: requirementsDocument(),
        traceabilityDocument: traceabilityDocument(new Map([[blockedId, "BLOCKED"]])),
        mode: "development",
      }),
    ).toEqual({ total: 543, passed: 542, blocked: 1 });

    expect(() =>
      checkM2Traceability({
        manifest,
        requirementsDocument: requirementsDocument(),
        traceabilityDocument: traceabilityDocument(new Map([["CAP-001", "BLOCKED"]])),
        mode: "development",
      }),
    ).toThrow("CAP-001 is not an approved post-merge production/operator blocker");
  });

  it("rejects every FAIL and keeps final verification at all PASS", () => {
    expect(() =>
      checkM2Traceability({
        manifest,
        requirementsDocument: requirementsDocument(),
        traceabilityDocument: traceabilityDocument(new Map([["DONE-075", "FAIL"]])),
        mode: "development",
      }),
    ).toThrow("DONE-075 must not remain FAIL");

    expect(() =>
      checkM2Traceability({
        manifest,
        requirementsDocument: requirementsDocument(),
        traceabilityDocument: traceabilityDocument(new Map([["DONE-075", "BLOCKED"]])),
        mode: "final",
      }),
    ).toThrow("DONE-075 must be PASS for final M2 verification");
  });

  it("rejects placeholder evidence even when a row says PASS", () => {
    const document = traceabilityDocument().replace(
      "| CAP-001 | concrete implementation | direct validation | PASS |",
      "| CAP-001 | Not implemented | Not verified | PASS |",
    );
    expect(() =>
      checkM2Traceability({
        manifest,
        requirementsDocument: requirementsDocument(),
        traceabilityDocument: document,
        mode: "development",
      }),
    ).toThrow("CAP-001 lacks concrete implementation or validation evidence");
  });
});
