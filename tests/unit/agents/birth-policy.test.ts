import { describe, expect, it } from "vitest";
import {
  buildBirthPersona,
  selectBirthParentEvidence,
  type BirthAssessmentEvidence,
} from "@/modules/agents/domain/birth-policy";
import { verifiedSourcePool } from "@/modules/agents/personas/verified-source-pool";
import { birthDraftBank } from "@/modules/agents/personas/birth-drafts";
import { agentPersonaTemplates } from "@/modules/agents/personas/templates";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";

const now = new Date("2026-10-06T12:00:00Z");
function rows(): BirthAssessmentEvidence[] {
  return ["2026-10-02T12:00:00Z", "2026-10-04T12:00:00Z", "2026-10-05T12:00:00Z"].map(
    (time, i) => ({
      id: `assessment-${i}`,
      agentProfileId: "parent",
      sourceActKey: `publish-${i}`,
      sourceContentHash: String(i).repeat(64),
      topicId: `topic-${i % 2}`,
      sourceAt: new Date(time),
      assessedAt: new Date("2026-10-06T10:00:00Z"),
      channel: "QUALITY",
      mode: "SHADOW",
      verdict: "SUPPORTED",
      policyVersion: 2,
      independentReviewConfirmed: true,
      currentlyVisibleAndUnchanged: true,
      reversed: false,
    }),
  );
}
const select = (assessments = rows(), active = true) =>
  selectBirthParentEvidence({ agentProfileId: "parent", active, assessments, now });

describe("birth parent evidence", () => {
  it("accepts independent shadow quality across two Istanbul weeks without a reward credit", () => {
    const result = select();
    expect(result.eligible).toBe(true);
    if (result.eligible) expect(result.evidence).toHaveLength(3);
    expect(select(rows(), false)).toEqual({ eligible: false, reason: "PARENT_INACTIVE" });
  });
  it.each([
    { channel: "INTRINSIC" as const },
    { mode: "OFF" as const },
    { verdict: "INSUFFICIENT" },
    { verdict: "CORRECTIVE" },
    { policyVersion: 1 },
    { independentReviewConfirmed: false },
    { currentlyVisibleAndUnchanged: false },
    { reversed: true },
    { agentProfileId: "foreign" },
    { sourceAt: new Date("2026-10-07T00:00:00Z") },
    { sourceAt: new Date("2026-09-22T12:00:00Z") },
  ])("rejects insufficient evidence when one required row changes: %o", (patch) => {
    const history = rows();
    history[0] = { ...history[0]!, ...patch };
    expect(select(history).eligible).toBe(false);
  });
  it("requires distinct origins and content, two topics, two weeks and at least 48 hours", () => {
    for (const field of ["sourceActKey", "sourceContentHash", "topicId"] as const) {
      const history = rows().map((row) => ({ ...row, [field]: rows()[0]![field] }));
      expect(select(history).eligible).toBe(false);
    }
    expect(
      select(
        rows().map((row, i) => ({ ...row, sourceAt: new Date(`2026-10-0${1 + i}T12:00:00Z`) })),
      ).eligible,
    ).toBe(false);
    expect(
      select(
        rows().map((row, i) => ({
          ...row,
          sourceAt: new Date(Date.parse("2026-10-04T20:00:00Z") + i * 3600000),
        })),
      ).eligible,
    ).toBe(false);
  });
  it("uses Istanbul Monday boundary and permits exactly 48 hours", () => {
    const history = rows();
    history[0]!.sourceAt = new Date("2026-10-03T21:00:00Z");
    history[1]!.sourceAt = new Date("2026-10-04T20:59:59Z");
    history[2]!.sourceAt = new Date("2026-10-05T21:00:00Z");
    expect(select(history).eligible).toBe(true);
    history[2]!.sourceAt = new Date("2026-10-05T20:59:59Z");
    expect(select(history).eligible).toBe(false);
  });
  it("does not fall back after a newer negative or hidden review, nor recertify a reversed origin", () => {
    for (const patch of [{ verdict: "INSUFFICIENT" }, { currentlyVisibleAndUnchanged: false }]) {
      const history = rows();
      history.push({ ...history[0]!, ...patch, id: "new", assessedAt: now });
      expect(select(history).eligible).toBe(false);
    }
    const history = rows();
    history[0]!.reversed = true;
    history.push({ ...history[0]!, reversed: false, id: "new", assessedAt: now });
    expect(select(history).eligible).toBe(false);
  });
  it("keeps old-but-current evidence inside 14 days, ignoring the feedback card lifetime", () => {
    const history = rows();
    history[0]!.sourceAt = new Date("2026-09-24T12:00:00Z");
    expect(select(history).eligible).toBe(true);
  });
  it("fails closed beyond 32 newest origins without reviving older positives", () => {
    const history = rows();
    for (let i = 0; i < 32; i += 1)
      history.push({
        ...history[0]!,
        id: `later-${i}`,
        sourceActKey: `later-${i}`,
        verdict: "INSUFFICIENT",
        assessedAt: now,
      });
    expect(select(history).eligible).toBe(false);
  });
  it("keeps QUALITY origins separate from later intrinsic reviews and their window", () => {
    const history = rows();
    history.push({ ...history[0]!, id: "intrinsic-same", channel: "INTRINSIC", assessedAt: now });
    for (let i = 0; i < 33; i += 1)
      history.push({
        ...history[0]!,
        id: `intrinsic-${i}`,
        sourceActKey: `intrinsic-${i}`,
        channel: "INTRINSIC",
        assessedAt: now,
      });
    expect(select(history).eligible).toBe(true);
  });
  it("does not hide a known reversal behind future assessment time or another channel", () => {
    const history = rows();
    history.push({
      ...history[0]!,
      id: "future",
      channel: "INTRINSIC",
      reversed: true,
      assessedAt: new Date("2026-10-07T00:00:00Z"),
    });
    expect(select(history).eligible).toBe(false);
    history[3]!.agentProfileId = "foreign";
    expect(select(history).eligible).toBe(true);
  });
  it("never falls back behind a future-dated quality verdict or visibility change", () => {
    for (const patch of [
      { verdict: "INSUFFICIENT" },
      { currentlyVisibleAndUnchanged: false },
      { verdict: "SUPPORTED" },
    ]) {
      const history = rows();
      history.push({
        ...history[0]!,
        ...patch,
        id: "future-quality",
        assessedAt: new Date("2026-10-07T00:00:00Z"),
      });
      expect(select(history).eligible).toBe(false);
    }
  });
  it("does not punish the author when three other supported origins remain", () => {
    const history = rows();
    history.push({
      ...history[0]!,
      id: "negative",
      sourceActKey: "another",
      verdict: "CORRECTIVE",
      assessedAt: now,
    });
    expect(select(history).eligible).toBe(true);
  });
});

describe("independent birth drafts", () => {
  it("passes unchanged separation gates against the complete template bank and each other", () => {
    expect(birthDraftBank.map(({ persona }) => persona.sources.length)).toEqual([12, 12]);
    expect(
      new Set(birthDraftBank.flatMap(({ persona }) => persona.sources.map(({ url }) => url))).size,
    ).toBe(24);
    const verified = new Map(verifiedSourcePool().map((source) => [source.url, source]));
    for (const { persona } of birthDraftBank) {
      expect(
        new Set(persona.sources.map(({ url }) => new URL(url).origin)).size,
      ).toBeGreaterThanOrEqual(6);
      expect(new Set(persona.sources.flatMap(({ topics }) => topics)).size).toBeGreaterThanOrEqual(
        5,
      );
      for (const source of persona.sources) {
        const registered = verified.get(source.url);
        expect(registered).toBeDefined();
        expect(source.sourceType).toBe(registered!.sourceType);
        expect(source.topics).toEqual(registered!.topics);
      }
    }
    const universe: unknown[] = [...agentPersonaTemplates];
    for (const draft of birthDraftBank) {
      const result = validatePersonaCandidate(
        draft.persona,
        universe,
        "Bağımsız aday doğrulaması.",
      );
      expect(result.report.pairwiseDistancePassed).toBe(true);
      universe.push(draft.persona);
      expect(draft.persona.identity.biography).toBe("");
      expect(
        draft.persona.sources.every((source) => source.status === "SEED" && !source.pinned),
      ).toBe(true);
      expect(
        agentPersonaTemplates.some((persona) => persona.username === draft.persona.username),
      ).toBe(false);
    }
  });
  it("keeps independent identity and temperament; inherits keys but never parent weights or source trust", () => {
    for (const draft of birthDraftBank) {
      for (const parent of agentPersonaTemplates) {
        const result = buildBirthPersona({
          draft: draft.persona,
          parent,
          existingPersonas: agentPersonaTemplates,
        });
        expect(result, `${draft.draftKey} / ${parent.username}`).not.toBeNull();
        if (!result) continue;
        expect(result.persona.temperament).toEqual(draft.persona.temperament);
        expect(result.persona.identity).toEqual(draft.persona.identity);
        expect(result.persona.writing).toEqual(draft.persona.writing);
        expect(result.persona.interests.map(({ weight }) => weight)).toEqual(
          draft.persona.interests.map(({ weight }) => weight),
        );
        expect(result.persona.coreValues.map(({ weight }) => weight)).toEqual(
          draft.persona.coreValues.map(({ weight }) => weight),
        );
        expect(
          result.persona.interests.filter(
            (value, i) => value.key !== draft.persona.interests[i]!.key,
          ),
        ).toHaveLength(1);
        expect(
          result.persona.coreValues.filter(
            (value, i) => value.key !== draft.persona.coreValues[i]!.key,
          ),
        ).toHaveLength(1);
        expect(result.persona.sources).toEqual(draft.persona.sources);
      }
    }
  });
  it("does not mutate donors and refuses invalid ontology or duplicate inherited keys", () => {
    const parent = structuredClone(agentPersonaTemplates[0]!);
    const draft = structuredClone(birthDraftBank[0]!.persona);
    const original = JSON.stringify({ parent, draft });
    buildBirthPersona({ draft, parent, existingPersonas: agentPersonaTemplates });
    expect(JSON.stringify({ parent, draft })).toBe(original);
    expect(
      buildBirthPersona({
        draft: {
          ...draft,
          identity: {
            ...draft.identity,
            selfDescription: "Ben bir doktorum; hastalıkların sonuçları üzerine düşünürüm.",
          },
        },
        parent,
        existingPersonas: [],
      }),
    ).toBeNull();
    parent.interests[1]!.key = parent.interests[0]!.key;
    expect(buildBirthPersona({ draft, parent, existingPersonas: [] })).toBeNull();
    expect(() =>
      buildBirthPersona({ draft, parent: agentPersonaTemplates[0], existingPersonas: [{}] }),
    ).toThrow();
  });
  it("preserves pinned draft slots, refuses fully pinned transfer and parses the whole universe", () => {
    const parent = agentPersonaTemplates[0]!;
    const draft = structuredClone(birthDraftBank[0]!.persona);
    draft.interests[4]!.pinned = true;
    draft.coreValues[3]!.pinned = true;
    const result = buildBirthPersona({ draft, parent, existingPersonas: [] });
    expect(result).not.toBeNull();
    expect(result!.persona.interests[4]).toEqual(draft.interests[4]);
    expect(result!.persona.coreValues[3]).toEqual(draft.coreValues[3]);
    expect(result!.persona.interests.map(({ pinned }) => pinned)).toEqual(
      draft.interests.map(({ pinned }) => pinned),
    );
    draft.interests.forEach((value) => {
      value.pinned = true;
    });
    expect(buildBirthPersona({ draft, parent, existingPersonas: [] })).toBeNull();
    expect(() => buildBirthPersona({ draft, parent, existingPersonas: [draft, {}] })).toThrow();
    expect(() => buildBirthPersona({ draft, parent, existingPersonas: [{}, draft] })).toThrow();
  });
  it("returns no candidate for a used identity or clone instead of relaxing distance", () => {
    const parent = agentPersonaTemplates[0]!;
    const draft = birthDraftBank[0]!.persona;
    expect(
      buildBirthPersona({ draft, parent, existingPersonas: [...agentPersonaTemplates, draft] }),
    ).toBeNull();
    expect(
      buildBirthPersona({
        draft: { ...parent, username: "renamed_copy" },
        parent,
        existingPersonas: [],
      }),
    ).toBeNull();
  });
});
