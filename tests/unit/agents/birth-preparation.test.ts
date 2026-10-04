import { describe, expect, it } from "vitest";
import { canonicalRequestHash } from "@/modules/idempotency/domain/idempotency";
import {
  birthPreparationPopulationFailure,
  classifyIndependentBirthRoot,
  type BirthRootEvidence,
} from "@/modules/agents/domain/birth-preparation";

const at = new Date("2026-08-01T00:00:00Z");
const persona = { username: "root", voice: "independent" };
const templates = new Set([canonicalRequestHash(persona)]);
const evidence = (): BirthRootEvidence => ({
  profileId: "root-id",
  createdAt: at,
  initial: { id: "version-id", persona, changeOrigin: "INITIAL", createdAt: at },
  creations: [{ id: "audit-id", method: "TEMPLATE", createdAt: at, contentHash: "a".repeat(64) }],
  genesis: [
    {
      id: "1",
      method: "TEMPLATE",
      origin: "AGENT_CREATION",
      createdAt: at,
      contentHash: "b".repeat(64),
    },
  ],
});

describe("birth preparation provenance and population", () => {
  it("pins the initial content and catalog with matching server creation evidence", () => {
    expect(classifyIndependentBirthRoot(evidence(), templates)).toMatchObject({
      rootProfileId: "root-id",
      initialPersonaVersionId: "version-id",
      initialPersonaHash: canonicalRequestHash(persona),
      templateCatalogHash: canonicalRequestHash([...templates]),
      creationAuditId: "audit-id",
      genesisEventId: "1",
    });
  });
  it.each(["CUSTOM", "IMPORT", "CLONE", "UNKNOWN"])(
    "does not convert %s to a root from content alone",
    (method) => {
      const value = evidence();
      value.creations[0]!.method = value.genesis[0]!.method = method;
      expect(classifyIndependentBirthRoot(value, templates)).toBeNull();
    },
  );
  it.each([
    "missing-initial",
    "missing-audit",
    "missing-genesis",
    "duplicate-audit",
    "duplicate-genesis",
    "method-mismatch",
    "late-genesis",
    "early-genesis",
    "changed-content",
    "non-initial",
  ])("fails closed for %s", (kind) => {
    const value = evidence();
    switch (kind) {
      case "missing-initial":
        value.initial = null;
        break;
      case "missing-audit":
        value.creations = [];
        break;
      case "missing-genesis":
        value.genesis = [];
        break;
      case "duplicate-audit":
        value.creations.push(value.creations[0]!);
        break;
      case "duplicate-genesis":
        value.genesis.push(value.genesis[0]!);
        break;
      case "method-mismatch":
        value.genesis[0]!.method = "CLONE";
        break;
      case "late-genesis":
        value.genesis[0]!.createdAt = new Date(at.getTime() + 60_001);
        break;
      case "early-genesis":
        value.genesis[0]!.createdAt = new Date(at.getTime() - 1);
        break;
      case "changed-content":
        value.initial!.persona = { ...persona, voice: "changed" };
        break;
      case "non-initial":
        value.initial!.changeOrigin = "EVOLUTION";
        break;
    }
    expect(classifyIndependentBirthRoot(value, templates)).toBeNull();
  });
  it.each([
    [39, 1, 0, null],
    [40, 1, 0, "POPULATION_LIMIT"],
    [36, 2, 0, "ROOT_LIMIT"],
    [36, 0, 0, "ROOT_UNKNOWN"],
    [36, 1, 1, "FIRST_PILOT_ALREADY_PREPARED"],
    [NaN, 1, 0, "POPULATION_UNKNOWN"],
    [-1, 1, 0, "POPULATION_UNKNOWN"],
  ])(
    "checks population %s / root %s / pilot %s",
    (nonRetiredProfiles, livingRootMembers, managedChildren, result) => {
      expect(
        birthPreparationPopulationFailure({
          nonRetiredProfiles: nonRetiredProfiles as number,
          livingRootMembers: livingRootMembers as number,
          managedChildren: managedChildren as number,
        }),
      ).toBe(result);
    },
  );
});
