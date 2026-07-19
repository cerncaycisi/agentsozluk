import { describe, expect, it } from "vitest";
import {
  adaptRuntimeNormalDecisionWire,
  normalizeRuntimeDecisionOutput,
  parseRuntimeDecisionOutput,
  runtimeDecisionJsonSchema,
  runtimeDecisionSchema,
  runtimeNormalDecisionWireJsonSchema,
  runtimeNormalDecisionWireSchema,
  runtimeNormalWireFieldNames,
} from "@/runtime/output";

function assertStrictObjects(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const schema = value as Record<string, unknown>;
  if (schema.type === "object" && schema.properties) {
    expect(schema.additionalProperties).toBe(false);
    expect([...(Array.isArray(schema.required) ? schema.required : [])].sort()).toEqual(
      Object.keys(schema.properties as Record<string, unknown>).sort(),
    );
  }
  for (const child of Object.values(schema)) assertStrictObjects(child);
}

function schemaPatterns(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(schemaPatterns);
  if (!value || typeof value !== "object") return [];
  const schema = value as Record<string, unknown>;
  return [
    ...(typeof schema.pattern === "string" ? [schema.pattern] : []),
    ...Object.values(schema).flatMap(schemaPatterns),
  ];
}

describe("runtime structured output wire contract", () => {
  const topicId = "00000000-0000-4000-8000-000000000001";
  const evidenceId = "00000000-0000-4000-8000-000000000002";
  const canonical = {
    safeSummary: "Görünür topic kanıtı güvenli bir entry adayını destekliyor.",
    state: {
      curiosity: 0.6,
      confidence: 0.7,
      topicFatigue: {
        items: [{ topicKey: "ölçülebilir-kapasite", fatigue: 0.25 }],
      },
    },
    observations: [
      {
        subjectType: "TOPIC" as const,
        subjectId: topicId,
        summary: "Topic üzerinde doğrulanabilir yeni bir tartışma alanı var.",
        salience: 0.8,
        provenance: "PLATFORM_EVENT" as const,
        evidenceIds: [evidenceId],
      },
    ],
    decisionJournal: [
      {
        seq: 1,
        kind: "OBSERVATION" as const,
        subject: "ölçülebilir-kapasite",
        summary: "Topic üzerinde doğrulanabilir yeni bir tartışma alanı gözlendi.",
        confidence: 0.8,
        evidenceIds: [evidenceId],
        causedBySeqs: [],
      },
      {
        seq: 2,
        kind: "OPTION_CONSIDERED" as const,
        subject: "entry-yazmak",
        summary: "Gözlenen tartışmaya sınırlı bir entry ile katılmak değerlendirildi.",
        confidence: 0.75,
        evidenceIds: [evidenceId],
        causedBySeqs: [1],
      },
      {
        seq: 3,
        kind: "OPTION_SELECTED" as const,
        subject: "entry-yazmak",
        summary: "Kanıtla sınırlı entry seçeneği seçildi.",
        confidence: 0.75,
        evidenceIds: [evidenceId],
        causedBySeqs: [2],
      },
    ],
    actions: [
      {
        type: "CREATE_ENTRY" as const,
        targetId: topicId,
        body: "Ölçülen veri ile yorumun sınırını ayırmak tartışmayı daha sağlam kılar.",
        desire: 0.75,
        expectedOutcome: "Topic üzerinde kanıtla sınırlı yeni bir entry görünür olacak.",
        selectedOptionSeq: 3,
        safeReason: "Görünür topic kanıtı özgün ve sınırlı bir entry adayını destekliyor.",
        claimProvenance: [
          {
            provenance: "PLATFORM_EVENT" as const,
            evidenceIds: [evidenceId],
            shortRationale: "Topic görünür platform olayıyla doğrulandı.",
          },
        ],
      },
    ],
    beliefDeltas: [],
    relationshipDeltas: [],
    sourceProposals: [],
    memoryCandidates: [],
  };

  it("advertises the exact canonical top-level fields with strict Zod/JSON-schema parity", () => {
    const properties = runtimeNormalDecisionWireJsonSchema.properties as Record<string, unknown>;
    expect(Object.keys(properties)).toEqual(runtimeNormalWireFieldNames);
    expect(runtimeNormalDecisionWireJsonSchema.required).toEqual(runtimeNormalWireFieldNames);
    expect(runtimeNormalDecisionWireJsonSchema.additionalProperties).toBe(false);
    expect(runtimeNormalDecisionWireJsonSchema).not.toHaveProperty("$schema");
    expect(JSON.stringify(runtimeNormalDecisionWireJsonSchema)).not.toContain('"format"');
    expect(JSON.stringify(runtimeNormalDecisionWireJsonSchema)).not.toContain('"const"');
    const patterns = schemaPatterns(runtimeNormalDecisionWireJsonSchema);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some((pattern) => /\(\?(?:[=!]|<[=!])/u.test(pattern))).toBe(false);
    assertStrictObjects(runtimeNormalDecisionWireJsonSchema);
    expect(runtimeNormalDecisionWireSchema.safeParse(canonical).success).toBe(true);
    expect(
      runtimeNormalDecisionWireSchema.safeParse({ ...canonical, safeSummary: "<script>x</script>" })
        .success,
    ).toBe(false);
    expect(
      (
        (
          (runtimeNormalDecisionWireJsonSchema.properties as Record<string, unknown>)
            .state as Record<string, unknown>
        ).properties as Record<string, unknown>
      ).topicFatigue,
    ).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["items"],
      properties: {
        items: {
          type: "array",
          maxItems: 50,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["topicKey", "fatigue"],
          },
        },
      },
    });
  });

  it("bounds topic-fatigue keys and values in both normal and reflection contracts", () => {
    expect(
      runtimeNormalDecisionWireSchema.safeParse({
        ...canonical,
        state: {
          ...canonical.state,
          topicFatigue: { items: [{ topicKey: "schema-parity", fatigue: 1 }] },
        },
      }).success,
    ).toBe(true);
    for (const topicFatigue of [
      { items: [{ topicKey: "", fatigue: 0.5 }] },
      { items: [{ topicKey: "x".repeat(101), fatigue: 0.5 }] },
      { items: [{ topicKey: "schema-parity", fatigue: -0.01 }] },
      { items: [{ topicKey: "schema-parity", fatigue: 1.01 }] },
      {
        items: [
          { topicKey: "duplicate", fatigue: 0.2 },
          { topicKey: "duplicate", fatigue: 0.3 },
        ],
      },
      {
        items: Array.from({ length: 51 }, (_, index) => ({
          topicKey: `topic-${index}`,
          fatigue: 0.5,
        })),
      },
    ])
      expect(
        runtimeNormalDecisionWireSchema.safeParse({
          ...canonical,
          state: { ...canonical.state, topicFatigue },
        }).success,
      ).toBe(false);
    assertStrictObjects(runtimeDecisionJsonSchema);
  });

  it("requires one coherent action provenance group instead of inventing MULTIPLE_SOURCES", () => {
    const trustedSourceId = "00000000-0000-4000-8000-000000000003";
    const mixed = {
      ...canonical,
      actions: [
        {
          ...canonical.actions[0],
          claimProvenance: [
            canonical.actions[0]!.claimProvenance[0]!,
            {
              provenance: "TRUSTED_SOURCE" as const,
              evidenceIds: [trustedSourceId],
              shortRationale: "Trusted source ayrı bir kanıt türüdür.",
            },
          ],
        },
      ],
    };
    expect(runtimeNormalDecisionWireSchema.safeParse(mixed).success).toBe(false);
    expect(parseRuntimeDecisionOutput(mixed).success).toBe(false);

    const coherent = runtimeNormalDecisionWireSchema.parse({
      ...canonical,
      actions: [
        {
          ...canonical.actions[0],
          claimProvenance: [
            canonical.actions[0]!.claimProvenance[0]!,
            {
              provenance: "PLATFORM_EVENT" as const,
              evidenceIds: [trustedSourceId],
              shortRationale: "İkinci görünür platform olayı aynı lineage grubundadır.",
            },
          ],
        },
      ],
    });
    expect(adaptRuntimeNormalDecisionWire(coherent).actions[0]?.provenance).toMatchObject({
      evidenceType: "PLATFORM_EVENT",
      evidenceIds: [evidenceId, trustedSourceId],
    });
  });

  it("rejects combined executable output above fifty without truncating the boundary", () => {
    const noAction = {
      type: "NO_ACTION" as const,
      desire: 0,
      expectedOutcome: "Dış dünyada state değişikliği beklenmiyor.",
      selectedOptionSeq: null,
      safeReason: "Boundary doğrulaması public action gerektirmiyor.",
      claimProvenance: [],
    };
    const beliefDelta = {
      topicKey: "combined-capacity",
      statement: "Action ve delta toplamı tek yürütme bütçesini paylaşır.",
      confidence: 0.7,
      evidenceSummary: "Görünür test kanıtı toplam bütçe sınırını doğrular.",
      provenance: "PLATFORM_EVENT" as const,
      evidenceIds: [evidenceId],
      desire: 0.6,
      expectedOutcome: "Belief güveni görünür kanıta göre sınırlı biçimde güncellenecek.",
      selectedOptionSeq: 3,
    };
    expect(
      runtimeNormalDecisionWireSchema.safeParse({
        ...canonical,
        actions: Array.from({ length: 49 }, () => noAction),
        beliefDeltas: [beliefDelta],
      }).success,
    ).toBe(true);
    expect(
      runtimeNormalDecisionWireSchema.safeParse({
        ...canonical,
        actions: Array.from({ length: 49 }, () => noAction),
        beliefDeltas: [beliefDelta, { ...beliefDelta, topicKey: "combined-capacity-2" }],
      }).success,
    ).toBe(false);
  });

  it("adapts canonical flat wire data deterministically into the validated internal model", () => {
    const first = adaptRuntimeNormalDecisionWire(runtimeNormalDecisionWireSchema.parse(canonical));
    const second = adaptRuntimeNormalDecisionWire(runtimeNormalDecisionWireSchema.parse(canonical));
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      state: {
        curiosity: canonical.state.curiosity,
        confidence: canonical.state.confidence,
        topicFatigue: { "ölçülebilir-kapasite": 0.25 },
      },
      actions: [
        {
          sequence: 1,
          actionType: "CREATE_ENTRY",
          targetType: "TOPIC",
          targetId: topicId,
          input: { topicId, body: canonical.actions[0]!.body },
          provenance: {
            evidenceType: "PLATFORM_EVENT",
            evidenceIds: [evidenceId],
          },
          desire: 0.75,
          expectedOutcome: canonical.actions[0]!.expectedOutcome,
          selectedOptionSeq: 3,
        },
      ],
      safeRunSummary: {
        operationSummary: canonical.safeSummary,
        observedItemIds: [topicId],
        shortRationale: canonical.safeSummary,
      },
      reflectionDelta: null,
      memoryConsolidations: [],
    });
    expect(runtimeDecisionSchema.safeParse(first).success).toBe(true);
  });

  it("preserves every observation, memory candidate, decision step and action intent", () => {
    const secondEvidenceId = "00000000-0000-4000-8000-000000000003";
    const secondObservation = {
      ...canonical.observations[0],
      subjectId: secondEvidenceId,
      summary: "İkinci görünür gözlem bağımsız biçimde korunmalıdır.",
      evidenceIds: [secondEvidenceId],
    };
    const secondMemory = {
      ...canonical.observations[0],
      subjectId: secondEvidenceId,
      summary: "İkinci memory adayı bağımsız biçimde korunmalıdır.",
      evidenceIds: [secondEvidenceId],
    };
    const noAction = {
      type: "NO_ACTION" as const,
      desire: 0.1,
      expectedOutcome: "İkinci intent dış dünyada değişiklik üretmeyecek.",
      selectedOptionSeq: null,
      safeReason: "İkinci intent görünür biçimde no-action olarak korunuyor.",
      claimProvenance: [],
    };
    const wire = runtimeNormalDecisionWireSchema.parse({
      ...canonical,
      observations: [canonical.observations[0], secondObservation],
      memoryCandidates: [canonical.observations[0], secondMemory],
      actions: [canonical.actions[0], noAction],
    });
    const adapted = adaptRuntimeNormalDecisionWire(wire);

    expect(adapted.observations).toHaveLength(2);
    expect(adapted.observations.map(({ subjectId }) => subjectId)).toEqual([
      topicId,
      secondEvidenceId,
    ]);
    expect(adapted.memoryCandidates).toHaveLength(2);
    expect(adapted.memoryCandidates.map(({ subjectId }) => subjectId)).toEqual([
      topicId,
      secondEvidenceId,
    ]);
    expect(adapted.decisionJournal).toEqual(canonical.decisionJournal);
    expect(adapted.actions).toHaveLength(2);
    expect(adapted.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sequence: 1,
          desire: canonical.actions[0]!.desire,
          expectedOutcome: canonical.actions[0]!.expectedOutcome,
          selectedOptionSeq: 3,
        }),
        expect.objectContaining({
          sequence: 2,
          actionType: "NO_ACTION",
          desire: noAction.desire,
          expectedOutcome: noAction.expectedOutcome,
          selectedOptionSeq: null,
        }),
      ]),
    );
  });

  it("preserves topic keys that match forbidden metadata names as schema-valid fatigue data", () => {
    const decision = adaptRuntimeNormalDecisionWire(
      runtimeNormalDecisionWireSchema.parse({
        ...canonical,
        state: {
          ...canonical.state,
          topicFatigue: {
            items: [
              { topicKey: "model", fatigue: 0.2 },
              { topicKey: "owner", fatigue: 0.4 },
            ],
          },
        },
      }),
    );

    expect(decision.state.topicFatigue).toEqual({ model: 0.2, owner: 0.4 });
    expect(runtimeDecisionSchema.safeParse(decision).success).toBe(true);
  });

  it("maps a canonical direct reply to the existing USER-target policy shape", () => {
    const authorId = "00000000-0000-4000-8000-000000000003";
    const entryId = "00000000-0000-4000-8000-000000000004";
    const reply = runtimeNormalDecisionWireSchema.parse({
      ...canonical,
      actions: [
        {
          ...canonical.actions[0],
          targetId: authorId,
          topicId,
          replyToEntryId: entryId,
          provocationSignal: 0.2,
        },
      ],
    });
    expect(adaptRuntimeNormalDecisionWire(reply).actions[0]).toMatchObject({
      actionType: "CREATE_ENTRY",
      targetType: "USER",
      targetId: authorId,
      input: {
        topicId,
        userId: authorId,
        replyToEntryId: entryId,
        provocationSignal: 0.2,
      },
    });
  });

  it("rejects unknown fields, unknown actions, HTML bodies and schema-external text", () => {
    expect(parseRuntimeDecisionOutput("plain text").success).toBe(false);
    expect(
      runtimeNormalDecisionWireSchema.safeParse({ ...canonical, reasoning: "private" }).success,
    ).toBe(false);
    for (const forbiddenField of ["chainOfThought", "rawPrompt", "internalMonologue"])
      expect(
        runtimeNormalDecisionWireSchema.safeParse({
          ...canonical,
          [forbiddenField]: "must not be retained",
        }).success,
      ).toBe(false);
    expect(
      runtimeNormalDecisionWireSchema.safeParse({
        ...canonical,
        observations: [{ ...canonical.observations[0], hiddenKind: "AGENT" }],
      }).success,
    ).toBe(false);
    expect(
      runtimeNormalDecisionWireSchema.safeParse({
        ...canonical,
        actions: [{ ...canonical.actions[0], type: "MODERATE_USER" }],
      }).success,
    ).toBe(false);
    expect(
      runtimeNormalDecisionWireSchema.safeParse({
        ...canonical,
        actions: [{ ...canonical.actions[0], body: "<b>HTML kabul edilmez</b>" }],
      }).success,
    ).toBe(false);
    for (const unsafeSummary of [
      `Bearer ${"a".repeat(32)}`,
      `api_key=${"b".repeat(24)}`,
      "operator@example.com",
      "satır sonu\niçeremez",
    ])
      expect(
        runtimeNormalDecisionWireSchema.safeParse({
          ...canonical,
          decisionJournal: [
            { ...canonical.decisionJournal[0], summary: unsafeSummary },
            ...canonical.decisionJournal.slice(1),
          ],
        }).success,
      ).toBe(false);
  });

  it("requires a bounded causal decision journal and links executable intent to selection", () => {
    expect(
      runtimeNormalDecisionWireSchema.safeParse({
        ...canonical,
        decisionJournal: canonical.decisionJournal.map((item) =>
          item.seq === 2 ? { ...item, causedBySeqs: [3] } : item,
        ),
      }).success,
    ).toBe(false);
    expect(
      runtimeNormalDecisionWireSchema.safeParse({
        ...canonical,
        decisionJournal: [canonical.decisionJournal[0], canonical.decisionJournal[0]],
      }).success,
    ).toBe(false);
    expect(
      runtimeNormalDecisionWireSchema.safeParse({
        ...canonical,
        actions: [{ ...canonical.actions[0], selectedOptionSeq: 2 }],
      }).success,
    ).toBe(false);
    expect(
      runtimeNormalDecisionWireSchema.safeParse({
        ...canonical,
        decisionJournal: Array.from({ length: 101 }, (_, index) => ({
          seq: index + 1,
          kind: "OBSERVATION" as const,
          subject: `bounded-${index}`,
          summary: "Bounded decision journal sınırı doğrulanıyor.",
          confidence: 0.5,
          evidenceIds: [],
          causedBySeqs: [],
        })),
      }).success,
    ).toBe(false);
  });

  it("uses strict required properties accepted by Codex structured output", () => {
    assertStrictObjects(runtimeDecisionJsonSchema);
  });

  it("removes nullable wire placeholders before Zod action validation", () => {
    const normalized = normalizeRuntimeDecisionOutput({
      state: {
        curiosity: 0.5,
        confidence: 0.5,
        topicFatigue: { items: [{ topicKey: "reflection-output", fatigue: 0.4 }] },
      },
      observations: [],
      actions: [
        {
          sequence: 1,
          actionType: "NO_ACTION",
          safeReason: "Yeni kanıt olmadığı için güvenli action üretilmedi.",
          targetType: null,
          targetId: null,
          input: {
            body: null,
            title: null,
            topicId: null,
            entryId: null,
            userId: null,
            username: null,
            value: null,
            url: null,
            statement: null,
            summary: null,
            topicKey: null,
            confidence: null,
            familiarity: null,
            trust: null,
            interest: null,
            disagreement: null,
            sourceType: null,
            topics: null,
          },
          provenance: null,
        },
      ],
      beliefDeltas: [],
      relationshipDeltas: [],
      sourceProposals: [],
      reflectionDelta: null,
      memoryConsolidations: [],
      memoryCandidates: [],
      safeRunSummary: {
        operationSummary: "Güvenli değerlendirme tamamlandı.",
        observedItemIds: [],
        shortRationale: "Yeni kanıt yok.",
      },
    });
    const parsed = runtimeDecisionSchema.parse(normalized);
    expect(parsed.state.topicFatigue).toEqual({ "reflection-output": 0.4 });
    expect(parsed.actions).toEqual([
      {
        sequence: 1,
        actionType: "NO_ACTION",
        desire: 0,
        expectedOutcome: "Dış dünyada doğrulanabilir bir değişiklik beklenmiyor.",
        selectedOptionSeq: null,
        safeReason: "Yeni kanıt olmadığı için güvenli action üretilmedi.",
        input: {},
      },
    ]);
  });

  it("accepts only bounded structured reflection and safe unique memory consolidation fields", () => {
    const memoryId = "00000000-0000-4000-8000-000000000001";
    const base = {
      state: { curiosity: 0.5, confidence: 0.5, topicFatigue: {} },
      observations: [],
      actions: [
        {
          sequence: 1,
          actionType: "NO_ACTION" as const,
          safeReason: "Reflection public action gerektirmiyor.",
          input: {},
        },
      ],
      beliefDeltas: [],
      relationshipDeltas: [],
      sourceProposals: [],
      reflectionDelta: {
        safeSummary: "Haftalık gözlemler sınırlı ve güvenli bir değişimi destekliyor.",
        interestDeltas: [],
        sourceTrustDeltas: [],
        relationshipTrustDeltas: [],
        beliefConfidenceDeltas: [],
        temperamentDeltas: [{ key: "curiosity" as const, delta: 0.01 }],
        coreValueDeltas: [],
      },
      memoryConsolidations: [
        {
          sourceMemoryIds: [memoryId],
          summary: "Aynı kanıt çizgisindeki gözlemler güvenli biçimde birleştirildi.",
          salience: 0.6,
        },
      ],
      memoryCandidates: [],
      safeRunSummary: {
        operationSummary: "Reflection çıktısı yapılandırılmış biçimde üretildi.",
        observedItemIds: [],
        shortRationale: "Yalnız izinli alanlar kullanıldı.",
      },
    };

    expect(runtimeDecisionSchema.safeParse(base).success).toBe(true);
    expect(
      runtimeDecisionSchema.safeParse({
        ...base,
        memoryConsolidations: [
          {
            sourceMemoryIds: [memoryId, memoryId],
            summary: "Tekrarlı lineage kimlikleri kabul edilmemelidir.",
            salience: 0.5,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      runtimeDecisionSchema.safeParse({
        ...base,
        memoryConsolidations: [
          { sourceMemoryIds: [memoryId], summary: "<b>Güvensiz özet</b>", salience: 0.5 },
        ],
      }).success,
    ).toBe(false);
  });
});
