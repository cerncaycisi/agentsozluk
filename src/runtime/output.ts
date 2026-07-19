import { z } from "zod";
import {
  runtimeActionSchema,
  runtimeFastStateSchema,
  runtimeMemoryConsolidationSchema,
  runtimeProvenanceSchema,
} from "@/modules/agents/validation/runtime-schemas";
import { weeklyPersonaEvolutionDeltaSchema } from "@/modules/agents/domain/persona-evolution";
import { temperamentKeys } from "@/modules/agents/personas/schema";
import { isSafeLifeLedgerText } from "@/modules/agents/domain/life-ledger-safety";

const uuidJsonPattern =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$";
const uuidWireSchema = z.string().regex(new RegExp(uuidJsonPattern, "u"));
const displaySafeWirePattern =
  /^(?![\s\S]*<\/?[A-Za-z][^>]*>)(?![\s\S]*[\u0000-\u001f\u007f])[\s\S]+$/u;
const entryBodyWirePattern = /^(?![\s\S]*<\/?[A-Za-z][^>]*>)[\s\S]+$/u;

export const runtimeWireProvenanceValues = [
  "PLATFORM_EVENT",
  "USER_ENTRY",
  "TRUSTED_SOURCE",
  "PROBATION_SOURCE",
  "MULTIPLE_SOURCES",
  "AGENT_MEMORY",
] as const;

export const runtimeNormalWireFieldNames = [
  "safeSummary",
  "state",
  "observations",
  "decisionJournal",
  "actions",
  "beliefDeltas",
  "relationshipDeltas",
  "sourceProposals",
  "memoryCandidates",
] as const;

const wireDisplayText = (maximum: number) =>
  z.string().trim().min(1).max(maximum).regex(displaySafeWirePattern).refine(isSafeLifeLedgerText);
const wireBody = z.string().trim().min(1).max(10_000).regex(entryBodyWirePattern);
const wireProvenanceValueSchema = z.enum(runtimeWireProvenanceValues);

const wireEvidenceSchema = z
  .object({
    provenance: wireProvenanceValueSchema,
    evidenceIds: z.array(uuidWireSchema).min(1).max(20),
    shortRationale: wireDisplayText(500),
  })
  .strict();

const wireObservationSchema = z
  .object({
    subjectType: z.enum(["TOPIC", "ENTRY", "USER", "SOURCE"]),
    subjectId: uuidWireSchema,
    summary: wireDisplayText(1000),
    salience: z.number().min(0).max(1),
    provenance: wireProvenanceValueSchema,
    evidenceIds: z.array(uuidWireSchema).max(20),
  })
  .strict();

export const runtimeDecisionJournalKinds = [
  "OBSERVATION",
  "INTERPRETATION",
  "OPTION_CONSIDERED",
  "OPTION_REJECTED",
  "OPTION_SELECTED",
  "STATE_PROPOSAL",
] as const;

const wireDecisionJournalItemSchema = z
  .object({
    seq: z.number().int().positive(),
    kind: z.enum(runtimeDecisionJournalKinds),
    subject: wireDisplayText(200),
    summary: wireDisplayText(1000),
    confidence: z.number().min(0).max(1),
    evidenceIds: z.array(uuidWireSchema).max(20),
    causedBySeqs: z
      .array(z.number().int().positive())
      .max(20)
      .refine((values) => new Set(values).size === values.length, {
        message: "causedBySeqs değerleri benzersiz olmalıdır.",
      }),
  })
  .strict();

const wireTopicFatigueSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            topicKey: z.string().trim().min(1).max(100),
            fatigue: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(50)
      .refine(
        (items) => new Set(items.map(({ topicKey }) => topicKey)).size === items.length,
        "topicFatigue topicKey değerleri benzersiz olmalıdır.",
      ),
  })
  .strict();

const wireFastStateSchema = z
  .object({
    curiosity: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    topicFatigue: wireTopicFatigueSchema,
  })
  .strict();

const wireClaimProvenanceSchema = z
  .array(wireEvidenceSchema)
  .max(20)
  .refine(
    (groups) => new Set(groups.map(({ provenance }) => provenance)).size <= 1,
    "claimProvenance içindeki bütün kanıt grupları aynı provenance türünü kullanmalıdır.",
  );

const wireActionIntentCommon = {
  desire: z.number().min(0).max(1),
  expectedOutcome: wireDisplayText(500),
  selectedOptionSeq: z.number().int().positive().nullable(),
};

const wireActionCommon = {
  ...wireActionIntentCommon,
  safeReason: wireDisplayText(500),
  claimProvenance: wireClaimProvenanceSchema,
};

const wireNoActionSchema = z.object({ type: z.literal("NO_ACTION"), ...wireActionCommon }).strict();
const wireCreateEntrySchema = z
  .object({
    type: z.literal("CREATE_ENTRY"),
    targetId: uuidWireSchema,
    body: wireBody,
    ...wireActionCommon,
  })
  .strict();
const wireCreateEntryReplySchema = wireCreateEntrySchema
  .extend({
    topicId: uuidWireSchema,
    replyToEntryId: uuidWireSchema,
    provocationSignal: z.number().min(0).max(1),
  })
  .strict();
const wireCreateTopicSchema = z
  .object({
    type: z.literal("CREATE_TOPIC_WITH_ENTRY"),
    title: z.string().trim().min(2).max(120),
    body: wireBody,
    ...wireActionCommon,
  })
  .strict();
const wireEditEntrySchema = z
  .object({
    type: z.literal("EDIT_OWN_ENTRY"),
    targetId: uuidWireSchema,
    body: wireBody,
    ...wireActionCommon,
  })
  .strict();

function targetOnlyWireAction(type: string) {
  return z
    .object({ type: z.literal(type), targetId: uuidWireSchema, ...wireActionCommon })
    .strict();
}

const wireProposeSourceActionSchema = z
  .object({
    type: z.literal("PROPOSE_SOURCE"),
    url: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .regex(/^https?:\/\/[^\s]+$/u),
    sourceType: z.enum(["RSS", "ATOM", "HTML"]),
    topics: z.array(z.string().trim().min(2).max(100)).min(1).max(8),
    ...wireActionCommon,
  })
  .strict();
const wireUpdateBeliefActionSchema = z
  .object({
    type: z.literal("UPDATE_BELIEF"),
    topicKey: z.string().trim().min(1).max(200),
    statement: wireDisplayText(2000),
    confidence: z.number().min(0).max(1),
    summary: wireDisplayText(2000),
    ...wireActionCommon,
  })
  .strict();
const wireUpdateRelationshipActionSchema = z
  .object({
    type: z.literal("UPDATE_RELATIONSHIP_NOTE"),
    targetId: uuidWireSchema,
    familiarity: z.number().min(0).max(1),
    trust: z.number().min(0).max(1),
    interest: z.number().min(0).max(1),
    disagreement: z.number().min(0).max(1),
    summary: wireDisplayText(2000),
    ...wireActionCommon,
  })
  .strict();

const runtimeNormalWireActionSchema = z.union([
  wireNoActionSchema,
  wireCreateEntryReplySchema,
  wireCreateEntrySchema,
  wireCreateTopicSchema,
  wireEditEntrySchema,
  targetOnlyWireAction("VOTE_UP"),
  targetOnlyWireAction("VOTE_DOWN"),
  targetOnlyWireAction("REMOVE_VOTE"),
  targetOnlyWireAction("FOLLOW_TOPIC"),
  targetOnlyWireAction("UNFOLLOW_TOPIC"),
  targetOnlyWireAction("FOLLOW_USER"),
  targetOnlyWireAction("UNFOLLOW_USER"),
  targetOnlyWireAction("BOOKMARK_ENTRY"),
  targetOnlyWireAction("REMOVE_BOOKMARK"),
  wireProposeSourceActionSchema,
  wireUpdateBeliefActionSchema,
  wireUpdateRelationshipActionSchema,
]);

const wireBeliefDeltaSchema = z
  .object({
    topicKey: z.string().trim().min(1).max(200),
    statement: wireDisplayText(2000),
    confidence: z.number().min(0).max(1),
    evidenceSummary: wireDisplayText(2000),
    provenance: wireProvenanceValueSchema,
    evidenceIds: z.array(uuidWireSchema).min(1).max(20),
    ...wireActionIntentCommon,
  })
  .strict();
const wireRelationshipDeltaSchema = z
  .object({
    userId: uuidWireSchema,
    familiarity: z.number().min(0).max(1),
    trust: z.number().min(0).max(1),
    interest: z.number().min(0).max(1),
    disagreement: z.number().min(0).max(1),
    summary: wireDisplayText(2000),
    provenance: wireProvenanceValueSchema,
    evidenceIds: z.array(uuidWireSchema).min(1).max(20),
    ...wireActionIntentCommon,
  })
  .strict();
const wireSourceProposalSchema = z
  .object({
    url: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .regex(/^https?:\/\/[^\s]+$/u),
    sourceType: z.enum(["RSS", "ATOM", "HTML"]),
    topics: z.array(z.string().trim().min(2).max(100)).min(1).max(8),
    provenance: wireProvenanceValueSchema,
    evidenceIds: z.array(uuidWireSchema).min(1).max(20),
    ...wireActionIntentCommon,
  })
  .strict();

export const runtimeNormalDecisionWireSchema = z
  .object({
    safeSummary: wireDisplayText(1000),
    state: wireFastStateSchema,
    observations: z.array(wireObservationSchema).max(100),
    decisionJournal: z.array(wireDecisionJournalItemSchema).min(1).max(100),
    actions: z.array(runtimeNormalWireActionSchema).max(50),
    beliefDeltas: z.array(wireBeliefDeltaSchema).max(20),
    relationshipDeltas: z.array(wireRelationshipDeltaSchema).max(20),
    sourceProposals: z.array(wireSourceProposalSchema).max(10),
    memoryCandidates: z.array(wireObservationSchema).max(50),
  })
  .strict()
  .superRefine((decision, context) => {
    const executableActionCount =
      decision.actions.length +
      decision.beliefDeltas.length +
      decision.relationshipDeltas.length +
      decision.sourceProposals.length;
    if (executableActionCount > 50)
      context.addIssue({
        code: "custom",
        path: ["actions"],
        message: "Action ve türetilen delta/proposal toplamı 50 sınırını aşamaz.",
      });
    const journalBySequence = new Map<number, (typeof decision.decisionJournal)[number]>();
    for (const [index, item] of decision.decisionJournal.entries()) {
      if (journalBySequence.has(item.seq))
        context.addIssue({
          code: "custom",
          path: ["decisionJournal", index, "seq"],
          message: "Decision journal seq değerleri benzersiz olmalıdır.",
        });
      journalBySequence.set(item.seq, item);
    }
    for (const [index, item] of decision.decisionJournal.entries())
      for (const causedBySeq of item.causedBySeqs) {
        const cause = journalBySequence.get(causedBySeq);
        if (!cause || causedBySeq >= item.seq)
          context.addIssue({
            code: "custom",
            path: ["decisionJournal", index, "causedBySeqs"],
            message:
              "causedBySeqs yalnız mevcut ve daha önceki journal seq değerlerini içerebilir.",
          });
      }
    for (const [index, action] of decision.actions.entries()) {
      if (action.type === "NO_ACTION") continue;
      const selected =
        action.selectedOptionSeq === null
          ? undefined
          : journalBySequence.get(action.selectedOptionSeq);
      if (!selected || selected.kind !== "OPTION_SELECTED")
        context.addIssue({
          code: "custom",
          path: ["actions", index, "selectedOptionSeq"],
          message: "Executable action geçerli bir OPTION_SELECTED journal kaydına bağlanmalıdır.",
        });
    }
    for (const [field, candidates] of [
      ["beliefDeltas", decision.beliefDeltas],
      ["relationshipDeltas", decision.relationshipDeltas],
      ["sourceProposals", decision.sourceProposals],
    ] as const)
      for (const [index, candidate] of candidates.entries()) {
        const selected =
          candidate.selectedOptionSeq === null
            ? undefined
            : journalBySequence.get(candidate.selectedOptionSeq);
        if (!selected || selected.kind !== "OPTION_SELECTED")
          context.addIssue({
            code: "custom",
            path: [field, index, "selectedOptionSeq"],
            message: "Türetilen action geçerli bir OPTION_SELECTED journal kaydına bağlanmalıdır.",
          });
      }
  });

export type RuntimeNormalDecisionWire = z.infer<typeof runtimeNormalDecisionWireSchema>;

function codexCompatibleJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(codexCompatibleJsonSchema);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record)
      .filter(
        ([key, nested]) =>
          key !== "$schema" &&
          key !== "const" &&
          key !== "uniqueItems" &&
          !(key === "pattern" && typeof nested === "string" && /\(\?(?:[=!]|<[=!])/u.test(nested)),
      )
      .map(([key, nested]) => [key, codexCompatibleJsonSchema(nested)])
      .concat("const" in record ? [["enum", [record.const]]] : []),
  );
}

export const runtimeNormalDecisionWireJsonSchema: Record<string, unknown> = Object.fromEntries(
  Object.entries(
    codexCompatibleJsonSchema(z.toJSONSchema(runtimeNormalDecisionWireSchema)) as Record<
      string,
      unknown
    >,
  ),
);

const observationSchema = z
  .object({
    subjectType: z.enum(["TOPIC", "ENTRY", "USER", "SOURCE"]),
    subjectId: z.string().uuid(),
    summary: z.string().trim().min(1).max(1000),
    salience: z.number().min(0).max(1),
    provenance: runtimeProvenanceSchema,
  })
  .strict();

export const runtimeDecisionJournalItemSchema = z
  .object({
    seq: z.number().int().positive(),
    kind: z.enum(runtimeDecisionJournalKinds),
    subject: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(displaySafeWirePattern)
      .refine(isSafeLifeLedgerText),
    summary: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .regex(displaySafeWirePattern)
      .refine(isSafeLifeLedgerText),
    confidence: z.number().min(0).max(1),
    evidenceIds: z.array(z.string().uuid()).max(20),
    causedBySeqs: z
      .array(z.number().int().positive())
      .max(20)
      .refine((values) => new Set(values).size === values.length, {
        message: "causedBySeqs değerleri benzersiz olmalıdır.",
      }),
  })
  .strict();

const runtimeDecisionActionIntentFields = {
  desire: z.number().min(0).max(1).default(0),
  expectedOutcome: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .regex(displaySafeWirePattern)
    .default("Dış dünyada doğrulanabilir bir değişiklik beklenmiyor."),
  selectedOptionSeq: z.number().int().positive().nullable().default(null),
};

const runtimeDecisionActionSchema = runtimeActionSchema
  .extend(runtimeDecisionActionIntentFields)
  .strict();

export const runtimeDecisionSchema = z
  .object({
    state: runtimeFastStateSchema,
    observations: z.array(observationSchema).max(100),
    decisionJournal: z.array(runtimeDecisionJournalItemSchema).max(100).default([]),
    actions: z.array(runtimeDecisionActionSchema).max(50),
    beliefDeltas: z
      .array(
        z
          .object({
            topicKey: z.string().trim().min(1).max(200),
            statement: z.string().trim().min(1).max(2000),
            confidence: z.number().min(0).max(1),
            evidenceSummary: z.string().trim().min(1).max(2000),
            provenance: runtimeProvenanceSchema,
            ...runtimeDecisionActionIntentFields,
          })
          .strict(),
      )
      .max(20),
    relationshipDeltas: z
      .array(
        z
          .object({
            userId: z.string().uuid(),
            familiarity: z.number().min(0).max(1),
            trust: z.number().min(0).max(1),
            interest: z.number().min(0).max(1),
            disagreement: z.number().min(0).max(1),
            summary: z.string().trim().min(1).max(2000),
            provenance: runtimeProvenanceSchema,
            ...runtimeDecisionActionIntentFields,
          })
          .strict(),
      )
      .max(20),
    sourceProposals: z
      .array(
        z
          .object({
            url: z.string().url().max(2048),
            sourceType: z.enum(["RSS", "ATOM", "HTML"]),
            topics: z.array(z.string().trim().min(2).max(100)).min(1).max(8),
            provenance: runtimeProvenanceSchema,
            ...runtimeDecisionActionIntentFields,
          })
          .strict(),
      )
      .max(10),
    reflectionDelta: weeklyPersonaEvolutionDeltaSchema.nullable(),
    memoryConsolidations: z.array(runtimeMemoryConsolidationSchema).max(20),
    memoryCandidates: z.array(observationSchema).max(50),
    safeRunSummary: z
      .object({
        operationSummary: z.string().trim().min(1).max(2000),
        observedItemIds: z.array(z.string().uuid()).max(200).default([]),
        shortRationale: z.string().trim().min(1).max(1000),
      })
      .strict(),
  })
  .superRefine((value, context) => {
    if (new Set(value.actions.map(({ sequence }) => sequence)).size !== value.actions.length)
      context.addIssue({
        code: "custom",
        path: ["actions"],
        message: "Action sequence değerleri benzersiz olmalıdır.",
      });
    const journalBySequence = new Map<number, (typeof value.decisionJournal)[number]>();
    for (const [index, item] of value.decisionJournal.entries()) {
      if (journalBySequence.has(item.seq))
        context.addIssue({
          code: "custom",
          path: ["decisionJournal", index, "seq"],
          message: "Decision journal seq değerleri benzersiz olmalıdır.",
        });
      journalBySequence.set(item.seq, item);
    }
    for (const [index, item] of value.decisionJournal.entries())
      for (const causedBySeq of item.causedBySeqs)
        if (!journalBySequence.has(causedBySeq) || causedBySeq >= item.seq)
          context.addIssue({
            code: "custom",
            path: ["decisionJournal", index, "causedBySeqs"],
            message:
              "causedBySeqs yalnız mevcut ve daha önceki journal seq değerlerini içerebilir.",
          });
    if (value.decisionJournal.length > 0)
      for (const [index, action] of value.actions.entries()) {
        if (action.actionType === "NO_ACTION") continue;
        const selected =
          action.selectedOptionSeq === null
            ? undefined
            : journalBySequence.get(action.selectedOptionSeq);
        if (!selected || selected.kind !== "OPTION_SELECTED")
          context.addIssue({
            code: "custom",
            path: ["actions", index, "selectedOptionSeq"],
            message: "Executable action geçerli bir OPTION_SELECTED journal kaydına bağlanmalıdır.",
          });
      }
    if (value.decisionJournal.length > 0)
      for (const [field, candidates] of [
        ["beliefDeltas", value.beliefDeltas],
        ["relationshipDeltas", value.relationshipDeltas],
        ["sourceProposals", value.sourceProposals],
      ] as const)
        for (const [index, candidate] of candidates.entries()) {
          const selected =
            candidate.selectedOptionSeq === null
              ? undefined
              : journalBySequence.get(candidate.selectedOptionSeq);
          if (!selected || selected.kind !== "OPTION_SELECTED")
            context.addIssue({
              code: "custom",
              path: [field, index, "selectedOptionSeq"],
              message:
                "Türetilen action geçerli bir OPTION_SELECTED journal kaydına bağlanmalıdır.",
            });
        }
  })
  .strict();

export type RuntimeDecision = z.infer<typeof runtimeDecisionSchema>;

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, nested]) => nested !== undefined && nested !== null),
  );
}

function wireProvenance(
  evidenceType: (typeof runtimeWireProvenanceValues)[number],
  evidenceIds: string[],
  shortRationale: string,
) {
  return {
    evidenceType,
    evidenceIds: [...new Set(evidenceIds)].slice(0, 20),
    shortRationale: shortRationale.slice(0, 500),
  };
}

function actionClaimProvenance(
  claimProvenance: RuntimeNormalDecisionWire["actions"][number]["claimProvenance"],
  safeReason: string,
) {
  if (claimProvenance.length === 0) return undefined;
  const evidenceType = claimProvenance[0]!.provenance;
  if (claimProvenance.some(({ provenance }) => provenance !== evidenceType))
    throw new Error("RUNTIME_WIRE_MIXED_ACTION_PROVENANCE");
  return wireProvenance(
    evidenceType,
    claimProvenance.flatMap(({ evidenceIds }) => evidenceIds),
    [...new Set(claimProvenance.map(({ shortRationale }) => shortRationale))].join("; ") ||
      safeReason,
  );
}

function wireActionTargetType(
  actionType: string,
  flatAction: Record<string, unknown>,
): string | undefined {
  if (actionType === "CREATE_ENTRY")
    return typeof flatAction.replyToEntryId === "string" ? "USER" : "TOPIC";
  if (["FOLLOW_TOPIC", "UNFOLLOW_TOPIC"].includes(actionType)) return "TOPIC";
  if (
    [
      "EDIT_OWN_ENTRY",
      "VOTE_UP",
      "VOTE_DOWN",
      "REMOVE_VOTE",
      "BOOKMARK_ENTRY",
      "REMOVE_BOOKMARK",
    ].includes(actionType)
  )
    return "ENTRY";
  if (["FOLLOW_USER", "UNFOLLOW_USER", "UPDATE_RELATIONSHIP_NOTE"].includes(actionType))
    return "USER";
  return undefined;
}

function adaptWireAction(action: RuntimeNormalDecisionWire["actions"][number], sequence: number) {
  const flat = action as unknown as Record<string, unknown>;
  const targetId = typeof flat.targetId === "string" ? flat.targetId : undefined;
  let input: Record<string, unknown> = {};
  switch (action.type) {
    case "CREATE_ENTRY":
      input = compactRecord({
        topicId: flat.topicId ?? targetId,
        body: flat.body,
        replyToEntryId: flat.replyToEntryId,
        userId: typeof flat.replyToEntryId === "string" ? targetId : undefined,
        provocationSignal: flat.provocationSignal,
      });
      break;
    case "CREATE_TOPIC_WITH_ENTRY":
      input = compactRecord({ title: flat.title, body: flat.body });
      break;
    case "EDIT_OWN_ENTRY":
      input = compactRecord({ entryId: targetId, body: flat.body });
      break;
    case "VOTE_UP":
      input = compactRecord({ entryId: targetId, value: 1 });
      break;
    case "VOTE_DOWN":
      input = compactRecord({ entryId: targetId, value: -1 });
      break;
    case "REMOVE_VOTE":
    case "BOOKMARK_ENTRY":
    case "REMOVE_BOOKMARK":
      input = compactRecord({ entryId: targetId });
      break;
    case "FOLLOW_TOPIC":
    case "UNFOLLOW_TOPIC":
      input = compactRecord({ topicId: targetId });
      break;
    case "FOLLOW_USER":
    case "UNFOLLOW_USER":
      input = compactRecord({ userId: targetId });
      break;
    case "PROPOSE_SOURCE":
      input = compactRecord({
        url: flat.url,
        sourceType: flat.sourceType,
        topics: flat.topics,
      });
      break;
    case "UPDATE_BELIEF":
      input = compactRecord({
        topicKey: flat.topicKey,
        statement: flat.statement,
        confidence: flat.confidence,
        summary: flat.summary,
      });
      break;
    case "UPDATE_RELATIONSHIP_NOTE":
      input = compactRecord({
        userId: targetId,
        familiarity: flat.familiarity,
        trust: flat.trust,
        interest: flat.interest,
        disagreement: flat.disagreement,
        summary: flat.summary,
      });
      break;
    case "NO_ACTION":
      break;
  }
  return {
    ...compactRecord({
      sequence,
      actionType: action.type,
      desire: action.desire,
      expectedOutcome: action.expectedOutcome,
      safeReason: action.safeReason,
      targetType: wireActionTargetType(action.type, flat),
      targetId,
      input,
      provenance:
        action.type === "NO_ACTION"
          ? undefined
          : actionClaimProvenance(action.claimProvenance, action.safeReason),
    }),
    selectedOptionSeq: action.selectedOptionSeq,
  };
}

function adaptedRuntimeDecision(wire: RuntimeNormalDecisionWire): unknown {
  const observations = wire.observations.map((observation) => ({
    subjectType: observation.subjectType,
    subjectId: observation.subjectId,
    summary: observation.summary,
    salience: observation.salience,
    provenance: wireProvenance(
      observation.provenance,
      observation.evidenceIds.length > 0 ? observation.evidenceIds : [observation.subjectId],
      observation.summary,
    ),
  }));
  const memoryCandidates = wire.memoryCandidates.map((candidate) => ({
    subjectType: candidate.subjectType,
    subjectId: candidate.subjectId,
    summary: candidate.summary,
    salience: candidate.salience,
    provenance: wireProvenance(
      candidate.provenance,
      candidate.evidenceIds.length > 0 ? candidate.evidenceIds : [candidate.subjectId],
      candidate.summary,
    ),
  }));
  const observedItemIds = [
    ...new Set([
      ...wire.observations.map(({ subjectId }) => subjectId),
      ...wire.memoryCandidates.map(({ subjectId }) => subjectId),
    ]),
  ];
  return {
    state: {
      curiosity: wire.state.curiosity,
      confidence: wire.state.confidence,
      topicFatigue: Object.fromEntries(
        wire.state.topicFatigue.items.map(({ topicKey, fatigue }) => [topicKey, fatigue]),
      ),
    },
    observations,
    decisionJournal: wire.decisionJournal,
    actions: wire.actions.map((action, index) => adaptWireAction(action, index + 1)),
    beliefDeltas: wire.beliefDeltas.map((delta) => ({
      topicKey: delta.topicKey,
      statement: delta.statement,
      confidence: delta.confidence,
      evidenceSummary: delta.evidenceSummary,
      provenance: wireProvenance(delta.provenance, delta.evidenceIds, delta.evidenceSummary),
      desire: delta.desire,
      expectedOutcome: delta.expectedOutcome,
      selectedOptionSeq: delta.selectedOptionSeq,
    })),
    relationshipDeltas: wire.relationshipDeltas.map((delta) => ({
      userId: delta.userId,
      familiarity: delta.familiarity,
      trust: delta.trust,
      interest: delta.interest,
      disagreement: delta.disagreement,
      summary: delta.summary,
      provenance: wireProvenance(delta.provenance, delta.evidenceIds, delta.summary),
      desire: delta.desire,
      expectedOutcome: delta.expectedOutcome,
      selectedOptionSeq: delta.selectedOptionSeq,
    })),
    sourceProposals: wire.sourceProposals.map((proposal) => ({
      url: proposal.url,
      sourceType: proposal.sourceType,
      topics: proposal.topics,
      provenance: wireProvenance(
        proposal.provenance,
        proposal.evidenceIds,
        `Source proposal: ${proposal.url}`,
      ),
      desire: proposal.desire,
      expectedOutcome: proposal.expectedOutcome,
      selectedOptionSeq: proposal.selectedOptionSeq,
    })),
    reflectionDelta: null,
    memoryConsolidations: [],
    memoryCandidates,
    safeRunSummary: {
      operationSummary: wire.safeSummary,
      observedItemIds,
      shortRationale: wire.safeSummary,
    },
  };
}

export function adaptRuntimeNormalDecisionWire(wire: RuntimeNormalDecisionWire): RuntimeDecision {
  return runtimeDecisionSchema.parse(adaptedRuntimeDecision(wire));
}

export type RuntimeDecisionParseResult =
  | { success: true; data: RuntimeDecision }
  | { success: false; error: z.ZodError };

export function parseRuntimeDecisionOutput(
  output: unknown,
  options: { allowExtendedCompatibility?: boolean } = {},
): RuntimeDecisionParseResult {
  const wire = runtimeNormalDecisionWireSchema.safeParse(output);
  if (wire.success) {
    const adapted = runtimeDecisionSchema.safeParse(adaptedRuntimeDecision(wire.data));
    return adapted.success
      ? { success: true, data: adapted.data }
      : { success: false, error: adapted.error };
  }
  if (options.allowExtendedCompatibility) {
    const extended = runtimeDecisionSchema.safeParse(normalizeRuntimeDecisionOutput(output));
    if (extended.success) return { success: true, data: extended.data };
  }
  return { success: false, error: wire.error };
}

export function normalizeRuntimeDecisionOutput(output: unknown): unknown {
  if (!output || typeof output !== "object" || Array.isArray(output)) return output;
  const record = output as Record<string, unknown>;
  const state = normalizeRuntimeFastStateOutput(record.state);
  if (!Array.isArray(record.actions)) return { ...record, state };
  return {
    ...record,
    state,
    actions: record.actions.map((action) => {
      if (!action || typeof action !== "object" || Array.isArray(action)) return action;
      const actionRecord = action as Record<string, unknown>;
      const input = actionRecord.input;
      return {
        ...Object.fromEntries(Object.entries(actionRecord).filter(([, value]) => value !== null)),
        input:
          input && typeof input === "object" && !Array.isArray(input)
            ? Object.fromEntries(
                Object.entries(input as Record<string, unknown>).filter(
                  ([, value]) => value !== null,
                ),
              )
            : input,
      };
    }),
  };
}

function normalizeRuntimeFastStateOutput(state: unknown): unknown {
  if (!state || typeof state !== "object" || Array.isArray(state)) return state;
  const stateRecord = state as Record<string, unknown>;
  const topicFatigue = stateRecord.topicFatigue;
  if (!topicFatigue || typeof topicFatigue !== "object" || Array.isArray(topicFatigue))
    return state;
  const fatigueRecord = topicFatigue as Record<string, unknown>;
  if (!Array.isArray(fatigueRecord.items)) return state;
  const entries = fatigueRecord.items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const itemRecord = item as Record<string, unknown>;
    return typeof itemRecord.topicKey === "string" && typeof itemRecord.fatigue === "number"
      ? [[itemRecord.topicKey, itemRecord.fatigue] as const]
      : [];
  });
  if (
    entries.length !== fatigueRecord.items.length ||
    new Set(entries.map(([topicKey]) => topicKey)).size !== entries.length
  )
    return state;
  return {
    ...stateRecord,
    topicFatigue: Object.fromEntries(entries),
  };
}

const provenanceJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["evidenceType", "evidenceIds", "shortRationale"],
  properties: {
    evidenceType: {
      type: "string",
      enum: [
        "PLATFORM_EVENT",
        "USER_ENTRY",
        "TRUSTED_SOURCE",
        "PROBATION_SOURCE",
        "MULTIPLE_SOURCES",
        "AGENT_MEMORY",
      ],
    },
    evidenceIds: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: { type: "string", pattern: uuidJsonPattern },
    },
    shortRationale: { type: "string", minLength: 1, maxLength: 500 },
  },
} as const;

const observationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["subjectType", "subjectId", "summary", "salience", "provenance"],
  properties: {
    subjectType: { type: "string", enum: ["TOPIC", "ENTRY", "USER", "SOURCE"] },
    subjectId: { type: "string", pattern: uuidJsonPattern },
    summary: { type: "string", minLength: 1, maxLength: 1000 },
    salience: { type: "number", minimum: 0, maximum: 1 },
    provenance: provenanceJsonSchema,
  },
} as const;

const decisionJournalItemJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["seq", "kind", "subject", "summary", "confidence", "evidenceIds", "causedBySeqs"],
  properties: {
    seq: { type: "integer", minimum: 1 },
    kind: { type: "string", enum: [...runtimeDecisionJournalKinds] },
    subject: { type: "string", minLength: 1, maxLength: 200 },
    summary: { type: "string", minLength: 1, maxLength: 1000 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidenceIds: {
      type: "array",
      maxItems: 20,
      items: { type: "string", pattern: uuidJsonPattern },
    },
    causedBySeqs: {
      type: "array",
      maxItems: 20,
      uniqueItems: true,
      items: { type: "integer", minimum: 1 },
    },
  },
} as const;

const memoryConsolidationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sourceMemoryIds", "summary", "salience"],
  properties: {
    sourceMemoryIds: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      uniqueItems: true,
      items: { type: "string", pattern: uuidJsonPattern },
    },
    summary: { type: "string", minLength: 10, maxLength: 2000 },
    salience: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

const weeklyPersonaEvolutionDeltaJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "safeSummary",
    "interestDeltas",
    "sourceTrustDeltas",
    "relationshipTrustDeltas",
    "beliefConfidenceDeltas",
    "temperamentDeltas",
    "coreValueDeltas",
  ],
  properties: {
    safeSummary: { type: "string", minLength: 10, maxLength: 1000 },
    interestDeltas: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "delta"],
        properties: {
          key: { type: "string", minLength: 2, maxLength: 100 },
          delta: { type: "number", minimum: -0.08, maximum: 0.08 },
        },
      },
    },
    sourceTrustDeltas: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceId", "delta"],
        properties: {
          sourceId: { type: "string", pattern: uuidJsonPattern },
          delta: { type: "number", minimum: -0.1, maximum: 0.1 },
        },
      },
    },
    relationshipTrustDeltas: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["targetUserId", "delta"],
        properties: {
          targetUserId: { type: "string", pattern: uuidJsonPattern },
          delta: { type: "number", minimum: -0.1, maximum: 0.1 },
        },
      },
    },
    beliefConfidenceDeltas: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topicKey", "delta"],
        properties: {
          topicKey: { type: "string", minLength: 1, maxLength: 200 },
          delta: { type: "number", minimum: -0.15, maximum: 0.15 },
        },
      },
    },
    temperamentDeltas: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "delta"],
        properties: {
          key: { type: "string", enum: [...temperamentKeys] },
          delta: { type: "number", minimum: -0.03, maximum: 0.03 },
        },
      },
    },
    coreValueDeltas: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "delta"],
        properties: {
          key: { type: "string", minLength: 2, maxLength: 100 },
          delta: { type: "number", minimum: -0.02, maximum: 0.02 },
        },
      },
    },
  },
} as const;

const nullableUuidJsonSchema = {
  anyOf: [{ type: "string", pattern: uuidJsonPattern }, { type: "null" }],
} as const;

const nullableProvenanceJsonSchema = {
  anyOf: [provenanceJsonSchema, { type: "null" }],
} as const;

const runtimeDecisionJsonSchemaSource: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "state",
    "observations",
    "decisionJournal",
    "actions",
    "beliefDeltas",
    "relationshipDeltas",
    "sourceProposals",
    "reflectionDelta",
    "memoryConsolidations",
    "memoryCandidates",
    "safeRunSummary",
  ],
  properties: {
    state: {
      type: "object",
      additionalProperties: false,
      required: ["curiosity", "confidence", "topicFatigue"],
      properties: {
        curiosity: { type: "number", minimum: 0, maximum: 1 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        topicFatigue: {
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
                properties: {
                  topicKey: { type: "string", minLength: 1, maxLength: 100 },
                  fatigue: { type: "number", minimum: 0, maximum: 1 },
                },
              },
            },
          },
        },
      },
    },
    observations: { type: "array", maxItems: 100, items: observationJsonSchema },
    decisionJournal: {
      type: "array",
      maxItems: 100,
      items: decisionJournalItemJsonSchema,
    },
    actions: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "sequence",
          "actionType",
          "desire",
          "expectedOutcome",
          "selectedOptionSeq",
          "safeReason",
          "targetType",
          "targetId",
          "input",
          "provenance",
        ],
        properties: {
          sequence: { type: "integer", minimum: 1 },
          actionType: {
            type: "string",
            enum: [
              "NO_ACTION",
              "CREATE_ENTRY",
              "CREATE_TOPIC_WITH_ENTRY",
              "EDIT_OWN_ENTRY",
              "VOTE_UP",
              "VOTE_DOWN",
              "REMOVE_VOTE",
              "FOLLOW_TOPIC",
              "UNFOLLOW_TOPIC",
              "FOLLOW_USER",
              "UNFOLLOW_USER",
              "BOOKMARK_ENTRY",
              "REMOVE_BOOKMARK",
              "PROPOSE_SOURCE",
              "UPDATE_BELIEF",
              "UPDATE_RELATIONSHIP_NOTE",
            ],
          },
          desire: { type: "number", minimum: 0, maximum: 1 },
          expectedOutcome: { type: "string", minLength: 1, maxLength: 500 },
          selectedOptionSeq: {
            anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }],
          },
          safeReason: { type: "string", minLength: 1, maxLength: 500 },
          targetType: { type: ["string", "null"], minLength: 1, maxLength: 64 },
          targetId: nullableUuidJsonSchema,
          input: {
            type: "object",
            additionalProperties: false,
            required: [
              "body",
              "title",
              "topicId",
              "entryId",
              "replyToEntryId",
              "provocationSignal",
              "userId",
              "username",
              "value",
              "url",
              "statement",
              "summary",
              "topicKey",
              "confidence",
              "familiarity",
              "trust",
              "interest",
              "disagreement",
              "sourceType",
              "topics",
            ],
            properties: {
              body: { type: ["string", "null"], minLength: 1, maxLength: 10_000 },
              title: { type: ["string", "null"], minLength: 2, maxLength: 120 },
              topicId: nullableUuidJsonSchema,
              entryId: nullableUuidJsonSchema,
              replyToEntryId: nullableUuidJsonSchema,
              provocationSignal: { type: ["number", "null"], minimum: 0, maximum: 1 },
              userId: nullableUuidJsonSchema,
              username: { type: ["string", "null"], pattern: "^[a-z0-9_]{3,30}$" },
              value: { enum: [-1, 1, null] },
              url: { type: ["string", "null"], maxLength: 2048 },
              statement: { type: ["string", "null"], minLength: 1, maxLength: 2000 },
              summary: { type: ["string", "null"], minLength: 1, maxLength: 2000 },
              topicKey: { type: ["string", "null"], minLength: 1, maxLength: 200 },
              confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
              familiarity: { type: ["number", "null"], minimum: 0, maximum: 1 },
              trust: { type: ["number", "null"], minimum: 0, maximum: 1 },
              interest: { type: ["number", "null"], minimum: 0, maximum: 1 },
              disagreement: { type: ["number", "null"], minimum: 0, maximum: 1 },
              sourceType: { enum: ["RSS", "ATOM", "HTML", null] },
              topics: {
                anyOf: [
                  {
                    type: "array",
                    minItems: 1,
                    maxItems: 8,
                    items: { type: "string", minLength: 2, maxLength: 100 },
                  },
                  { type: "null" },
                ],
              },
            },
          },
          provenance: nullableProvenanceJsonSchema,
        },
      },
    },
    beliefDeltas: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "topicKey",
          "statement",
          "confidence",
          "evidenceSummary",
          "provenance",
          "desire",
          "expectedOutcome",
          "selectedOptionSeq",
        ],
        properties: {
          topicKey: { type: "string", minLength: 1, maxLength: 200 },
          statement: { type: "string", minLength: 1, maxLength: 2000 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          evidenceSummary: { type: "string", minLength: 1, maxLength: 2000 },
          provenance: provenanceJsonSchema,
          desire: { type: "number", minimum: 0, maximum: 1 },
          expectedOutcome: { type: "string", minLength: 1, maxLength: 500 },
          selectedOptionSeq: {
            anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }],
          },
        },
      },
    },
    relationshipDeltas: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "userId",
          "familiarity",
          "trust",
          "interest",
          "disagreement",
          "summary",
          "provenance",
          "desire",
          "expectedOutcome",
          "selectedOptionSeq",
        ],
        properties: {
          userId: { type: "string", pattern: uuidJsonPattern },
          familiarity: { type: "number", minimum: 0, maximum: 1 },
          trust: { type: "number", minimum: 0, maximum: 1 },
          interest: { type: "number", minimum: 0, maximum: 1 },
          disagreement: { type: "number", minimum: 0, maximum: 1 },
          summary: { type: "string", minLength: 1, maxLength: 2000 },
          provenance: provenanceJsonSchema,
          desire: { type: "number", minimum: 0, maximum: 1 },
          expectedOutcome: { type: "string", minLength: 1, maxLength: 500 },
          selectedOptionSeq: {
            anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }],
          },
        },
      },
    },
    sourceProposals: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "url",
          "sourceType",
          "topics",
          "provenance",
          "desire",
          "expectedOutcome",
          "selectedOptionSeq",
        ],
        properties: {
          url: { type: "string", maxLength: 2048 },
          sourceType: { type: "string", enum: ["RSS", "ATOM", "HTML"] },
          topics: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string", minLength: 2, maxLength: 100 },
          },
          provenance: provenanceJsonSchema,
          desire: { type: "number", minimum: 0, maximum: 1 },
          expectedOutcome: { type: "string", minLength: 1, maxLength: 500 },
          selectedOptionSeq: {
            anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }],
          },
        },
      },
    },
    reflectionDelta: {
      anyOf: [weeklyPersonaEvolutionDeltaJsonSchema, { type: "null" }],
    },
    memoryConsolidations: {
      type: "array",
      maxItems: 20,
      items: memoryConsolidationJsonSchema,
    },
    memoryCandidates: { type: "array", maxItems: 50, items: observationJsonSchema },
    safeRunSummary: {
      type: "object",
      additionalProperties: false,
      required: ["operationSummary", "observedItemIds", "shortRationale"],
      properties: {
        operationSummary: { type: "string", minLength: 1, maxLength: 2000 },
        observedItemIds: {
          type: "array",
          maxItems: 200,
          items: { type: "string", pattern: uuidJsonPattern },
        },
        shortRationale: { type: "string", minLength: 1, maxLength: 1000 },
      },
    },
  },
};

export const runtimeDecisionJsonSchema = codexCompatibleJsonSchema(
  runtimeDecisionJsonSchemaSource,
) as Record<string, unknown>;
