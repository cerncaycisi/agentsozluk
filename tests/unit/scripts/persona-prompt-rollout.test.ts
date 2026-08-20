import { describe, expect, it } from "vitest";
import {
  buildPromptRolloutPlan,
  canonicalJson,
  defaultPromptRolloutReason,
  groupByTemplateSignature,
  personaHash,
  promptRolloutConfirmation,
  promptRolloutEnvironmentSchema,
  promptRolloutLifecycleStatuses,
  sharedPromptLines,
  templateSignature,
  type PersonaPromptRecord,
} from "../../../scripts/rollout-persona-prompts-helpers";

const oldTemplate = (name: string): string =>
  [
    "# Public identity",
    `Bu oturumda ${name} kullanıcı adıyla akışı değerlendiriyorsun.`,
    "",
    "# Claim provenance",
    "Doğrulanmayan iddiayı iddia olarak çerçevele.",
    "# Output",
    "Yalnız structured action response üret.",
  ].join("\n");

const newTemplate = (name: string): string =>
  [
    "# Public identity",
    `Bu oturumda ${name} kullanıcı adıyla akışı değerlendiriyorsun.`,
    "",
    "# Claim provenance",
    "Doğrulanmayan iddiayı iddia olarak çerçevele.",
    "Hazır bir çekince zayıf kanıtı güçlendirmez.",
    "# Output",
    "Yalnız structured action response üret.",
  ].join("\n");

function record(
  name: string,
  stored: string,
  expected: string,
  overrides: Partial<PersonaPromptRecord> = {},
): PersonaPromptRecord {
  return {
    profileId: `profile-${name}`,
    username: name,
    lifecycleStatus: "ACTIVE",
    personaVersionId: `version-${name}`,
    personaVersion: 4,
    storedPersonaHash: `persona-${name}`,
    normalizedPersonaHash: `persona-${name}`,
    storedPrompt: stored,
    expectedPrompt: expected,
    validation: "PASS",
    ...overrides,
  };
}

/** 18 Ağustos öncesi ve sonrası şablonla çalışan iki popülasyon. */
const splitPopulation: PersonaPromptRecord[] = [
  ...["ada", "berk", "ceren", "deniz"].map((name) =>
    record(name, oldTemplate(name), newTemplate(name)),
  ),
  ...["ege", "fulya", "gizem"].map((name) => record(name, newTemplate(name), newTemplate(name))),
];

describe("persona prompt rollout environment", () => {
  it("defaults to a dry run that needs no confirmation, snapshot or reason", () => {
    const environment = promptRolloutEnvironmentSchema.parse({});

    expect(environment.AGENT_PROMPT_ROLLOUT_MODE).toBe("DRY_RUN");
    expect(environment.AGENT_PROMPT_ROLLOUT_REASON).toBe(defaultPromptRolloutReason);
  });

  it("refuses every writing mode without the confirmation phrase", () => {
    for (const mode of ["PAUSE", "APPLY", "RESUME"]) {
      expect(() =>
        promptRolloutEnvironmentSchema.parse({ AGENT_PROMPT_ROLLOUT_MODE: mode }),
      ).toThrowError(/PROMPT_ROLLOUT_CONFIRMATION_REQUIRED/u);
      expect(() =>
        promptRolloutEnvironmentSchema.parse({
          AGENT_PROMPT_ROLLOUT_MODE: mode,
          AGENT_PROMPT_ROLLOUT_CONFIRMATION: "yes please",
        }),
      ).toThrowError(/PROMPT_ROLLOUT_CONFIRMATION_REQUIRED/u);
    }
  });

  it("requires a planned snapshot hash before applying, but not before pausing", () => {
    expect(() =>
      promptRolloutEnvironmentSchema.parse({
        AGENT_PROMPT_ROLLOUT_MODE: "APPLY",
        AGENT_PROMPT_ROLLOUT_CONFIRMATION: promptRolloutConfirmation,
      }),
    ).toThrowError(/PROMPT_ROLLOUT_SNAPSHOT_HASH_REQUIRED/u);
    expect(
      promptRolloutEnvironmentSchema.parse({
        AGENT_PROMPT_ROLLOUT_MODE: "PAUSE",
        AGENT_PROMPT_ROLLOUT_CONFIRMATION: promptRolloutConfirmation,
      }).AGENT_PROMPT_ROLLOUT_MODE,
    ).toBe("PAUSE");
    expect(() =>
      promptRolloutEnvironmentSchema.parse({
        AGENT_PROMPT_ROLLOUT_MODE: "APPLY",
        AGENT_PROMPT_ROLLOUT_CONFIRMATION: promptRolloutConfirmation,
        AGENT_PROMPT_ROLLOUT_EXPECTED_SNAPSHOT_HASH: "not-a-hash",
      }),
    ).toThrowError();
  });

  it("keeps retired agents out of the rollout population", () => {
    expect(promptRolloutLifecycleStatuses).toEqual(["DRAFT", "PAUSED", "ACTIVE", "SUSPENDED"]);
  });
});

describe("persona hashing", () => {
  it("ignores key order, so jsonb storage order is not read as a persona change", () => {
    // Postgres jsonb anahtarları kendi sırasına göre döndürür; zod çıktısı başka bir sıra üretir.
    expect(personaHash({ b: 1, a: { d: [1, 2], c: "x" } })).toBe(
      personaHash({ a: { c: "x", d: [1, 2] }, b: 1 }),
    );
  });

  it("still notices real content changes, including array order", () => {
    expect(personaHash({ a: [1, 2] })).not.toBe(personaHash({ a: [2, 1] }));
    expect(personaHash({ a: 1 })).not.toBe(personaHash({ a: 1, b: null }));
    expect(canonicalJson({ b: undefined, a: 1 })).toBe('{"a":1,"b":null}');
  });
});

describe("template signatures", () => {
  it("drops persona-specific lines and keeps the shared scaffolding", () => {
    const shared = sharedPromptLines(
      splitPopulation.map(({ storedPrompt, expectedPrompt }) => [storedPrompt, expectedPrompt]),
    );

    expect(shared.has("# Public identity")).toBe(true);
    expect(shared.has("Hazır bir çekince zayıf kanıtı güçlendirmez.")).toBe(true);
    expect(shared.has("Bu oturumda ada kullanıcı adıyla akışı değerlendiriyorsun.")).toBe(false);
  });

  it("gives one signature per template, not per persona", () => {
    const shared = sharedPromptLines(
      splitPopulation.map(({ storedPrompt, expectedPrompt }) => [storedPrompt, expectedPrompt]),
    );

    expect(templateSignature(oldTemplate("ada"), shared)).toBe(
      templateSignature(oldTemplate("berk"), shared),
    );
    expect(templateSignature(newTemplate("ada"), shared)).toBe(
      templateSignature(newTemplate("ege"), shared),
    );
    expect(templateSignature(oldTemplate("ada"), shared)).not.toBe(
      templateSignature(newTemplate("ada"), shared),
    );
  });

  it("orders groups by size", () => {
    expect(
      groupByTemplateSignature([
        { username: "b", signature: "s1" },
        { username: "a", signature: "s2" },
        { username: "c", signature: "s2" },
      ]),
    ).toEqual([
      { signature: "s2", count: 2, usernames: ["a", "c"] },
      { signature: "s1", count: 1, usernames: ["b"] },
    ]);
  });
});

describe("persona prompt rollout plan", () => {
  it("reports the split population before the rollout and a single one after", () => {
    const plan = buildPromptRolloutPlan(splitPopulation);

    expect(plan.profileCount).toBe(7);
    expect(plan.changeCount).toBe(4);
    expect(plan.beforeTemplateGroups.map(({ count }) => count)).toEqual([4, 3]);
    expect(plan.beforeTemplateGroups[1]!.usernames).toEqual(["ege", "fulya", "gizem"]);
    expect(plan.afterTemplateGroups).toHaveLength(1);
    expect(plan.afterTemplateGroups[0]!.count).toBe(7);
  });

  it("marks only the personas whose rendered prompt actually moved", () => {
    const plan = buildPromptRolloutPlan(splitPopulation);
    const changed = plan.receipts.filter(({ changeNeeded }) => changeNeeded);

    expect(changed.map(({ username }) => username)).toEqual(["ada", "berk", "ceren", "deniz"]);
    for (const receipt of changed) {
      expect(receipt.storedPromptHash).not.toBe(receipt.expectedPromptHash);
      expect(receipt.promptLengthDelta).toBe(
        "Hazır bir çekince zayıf kanıtı güçlendirmez.\n".length,
      );
    }
    for (const receipt of plan.receipts.filter(({ changeNeeded }) => !changeNeeded)) {
      expect(receipt.promptLengthDelta).toBe(0);
      expect(receipt.storedPromptHash).toBe(receipt.expectedPromptHash);
    }
  });

  it("is a no-op once every snapshot matches the current renderer", () => {
    const settled = splitPopulation.map((entry) =>
      record(entry.username, entry.expectedPrompt, entry.expectedPrompt),
    );
    const plan = buildPromptRolloutPlan(settled);

    expect(plan.changeCount).toBe(0);
    expect(plan.afterTemplateGroups).toHaveLength(1);
    expect(plan.beforeTemplateGroups).toEqual(plan.afterTemplateGroups);
  });

  it("hashes the observed state, so a plan cannot be applied to a drifted population", () => {
    const base = buildPromptRolloutPlan(splitPopulation);

    expect(base.snapshotHash).toBe(buildPromptRolloutPlan([...splitPopulation]).snapshotHash);
    expect(base.snapshotHash).not.toBe(
      buildPromptRolloutPlan(
        splitPopulation.map((entry, index) =>
          index === 0 ? { ...entry, personaVersion: entry.personaVersion + 1 } : entry,
        ),
      ).snapshotHash,
    );
    // Renderer değişikliği planı değil, yalnız beklenen çıktıyı etkiler: snapshot depo durumudur.
    expect(base.snapshotHash).toBe(
      buildPromptRolloutPlan(
        splitPopulation.map((entry) => ({
          ...entry,
          expectedPrompt: `${entry.expectedPrompt}\nx`,
        })),
      ).snapshotHash,
    );
  });

  it("surfaces persona normalization drift and validation failures as counts", () => {
    const plan = buildPromptRolloutPlan([
      record("ada", oldTemplate("ada"), newTemplate("ada"), { normalizedPersonaHash: "other" }),
      record("berk", oldTemplate("berk"), newTemplate("berk"), {
        validation: "PERSONA_ONTOLOGY_REJECTED",
      }),
      record("ceren", newTemplate("ceren"), newTemplate("ceren")),
    ]);

    expect(plan.personaDriftCount).toBe(1);
    expect(plan.validationFailureCount).toBe(1);
    expect(plan.receipts[0]!.personaNormalizationDrift).toBe(true);
    expect(plan.receipts[2]!.personaNormalizationDrift).toBe(false);
  });
});
