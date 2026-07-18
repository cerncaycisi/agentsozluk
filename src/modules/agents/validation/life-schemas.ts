import { z } from "zod";
import {
  runtimeActionsSchema,
  runtimeLeaseTokenSchema,
  runtimeProvenanceSchema,
  runtimeWorkerIdSchema,
} from "@/modules/agents/validation/runtime-schemas";
import { isSafeLifeLedgerText } from "@/modules/agents/domain/life-ledger-safety";

export const agentLifeEventTypes = [
  "LIFE_GENESIS_SNAPSHOT",
  "CONTEXT_PRESENTED",
  "SOURCE_FETCH_ATTEMPT",
  "SOURCE_FETCH_RESULT",
  "OBSERVATION_RECORDED",
  "DECISION_STEP_RECORDED",
  "MEMORY_CANDIDATE_PROPOSED",
  "MEMORY_CANDIDATE_COMMITTED",
  "MEMORY_CANDIDATE_REJECTED",
  "ACTION_PROPOSED",
  "ACTION_STATUS_CHANGED",
  "BELIEF_CHANGED",
  "RELATIONSHIP_CHANGED",
  "FAST_STATE_CHANGED",
  "PERSONA_CHANGED",
  "AGENT_PROFILE_CHANGED",
  "SOURCE_STATE_CHANGED",
  "MEMORY_CHANGED",
] as const;

export const agentLifeEventTypeSchema = z.enum(agentLifeEventTypes);

const displaySafeText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), {
      message: "Life ledger metni kontrol karakteri veya satır sonu içeremez.",
    })
    .refine((value) => !/<\/?[a-z][^>]*>/iu.test(value), {
      message: "Life ledger metni HTML içeremez.",
    })
    .refine(isSafeLifeLedgerText, {
      message: "Life ledger metni credential, e-posta veya hassas içerik barındıramaz.",
    });

export const agentLifeObservationSchema = z
  .object({
    subjectType: z.enum(["TOPIC", "ENTRY", "USER", "SOURCE"]),
    subjectId: z.string().uuid(),
    summary: displaySafeText(1000),
    salience: z.number().min(0).max(1),
    provenance: runtimeProvenanceSchema,
  })
  .strict();

export const agentDecisionJournalStepSchema = z
  .object({
    seq: z.number().int().positive(),
    kind: z.enum([
      "OBSERVATION",
      "INTERPRETATION",
      "OPTION_CONSIDERED",
      "OPTION_REJECTED",
      "OPTION_SELECTED",
      "STATE_PROPOSAL",
    ]),
    subject: displaySafeText(200),
    summary: displaySafeText(1000),
    confidence: z.number().min(0).max(1),
    evidenceIds: z.array(z.string().uuid()).max(20),
    causedBySeqs: z.array(z.number().int().positive()).max(20),
  })
  .strict();

export const agentActionIntentSchema = z
  .object({
    sequence: z.number().int().positive(),
    desire: z.number().min(0).max(1),
    expectedOutcome: displaySafeText(500),
    selectedOptionSeq: z.number().int().positive().nullable(),
  })
  .strict();

export const runtimeLifeEventPayloadSchema = z
  .object({
    observations: z.array(agentLifeObservationSchema).max(100),
    memoryCandidates: z.array(agentLifeObservationSchema).max(50),
    decisionJournal: z.array(agentDecisionJournalStepSchema).max(100),
    actionIntents: z.array(agentActionIntentSchema).max(50),
  })
  .strict();

export const runtimeLifeEventBatchSchema = z
  .object({
    workerId: runtimeWorkerIdSchema,
    leaseToken: runtimeLeaseTokenSchema,
    payload: runtimeLifeEventPayloadSchema,
  })
  .strict()
  .superRefine(({ payload }, context) => {
    if (
      payload.observations.length +
        payload.memoryCandidates.length +
        payload.decisionJournal.length +
        payload.actionIntents.length ===
      0
    )
      context.addIssue({
        code: "custom",
        path: ["payload"],
        message: "Life event batch en az bir kayıt içermelidir.",
      });
    const journalBySequence = new Map(payload.decisionJournal.map((step) => [step.seq, step]));
    if (journalBySequence.size !== payload.decisionJournal.length)
      context.addIssue({
        code: "custom",
        path: ["payload", "decisionJournal"],
        message: "Decision journal seq değerleri benzersiz olmalıdır.",
      });
    for (const [index, step] of payload.decisionJournal.entries())
      for (const cause of step.causedBySeqs)
        if (cause >= step.seq || !journalBySequence.has(cause))
          context.addIssue({
            code: "custom",
            path: ["payload", "decisionJournal", index, "causedBySeqs"],
            message: "Decision journal nedenleri yalnız daha erken mevcut adımları gösterebilir.",
          });
    if (
      new Set(payload.actionIntents.map(({ sequence }) => sequence)).size !==
      payload.actionIntents.length
    )
      context.addIssue({
        code: "custom",
        path: ["payload", "actionIntents"],
        message: "Action intent sequence değerleri benzersiz olmalıdır.",
      });
    for (const [index, intent] of payload.actionIntents.entries()) {
      if (intent.selectedOptionSeq === null) continue;
      if (journalBySequence.get(intent.selectedOptionSeq)?.kind !== "OPTION_SELECTED")
        context.addIssue({
          code: "custom",
          path: ["payload", "actionIntents", index, "selectedOptionSeq"],
          message: "Action intent yalnız OPTION_SELECTED journal adımına bağlanabilir.",
        });
    }
  });

export const runtimeDecisionBatchSchema = runtimeActionsSchema
  .extend({ payload: runtimeLifeEventPayloadSchema })
  .strict()
  .superRefine(({ actions, payload }, context) => {
    const actionSequences = [...actions.map(({ sequence }) => sequence)].sort((a, b) => a - b);
    const intentSequences = [...payload.actionIntents.map(({ sequence }) => sequence)].sort(
      (a, b) => a - b,
    );
    if (JSON.stringify(actionSequences) !== JSON.stringify(intentSequences))
      context.addIssue({
        code: "custom",
        path: ["payload", "actionIntents"],
        message: "Atomic decision batch her action için birebir action intent taşımalıdır.",
      });
  });

export const agentLifeQuerySchema = z
  .object({
    cursor: z
      .string()
      .regex(/^\d{1,19}$/u)
      .refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n, {
        message: "Cursor PostgreSQL BIGINT üst sınırını aşamaz.",
      })
      .optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    eventType: z.string().trim().min(1).max(100).optional(),
    runId: z.string().uuid().optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    format: z.enum(["json", "jsonl"]).default("json"),
  })
  .strict()
  .refine(({ from, to }) => !from || !to || new Date(from).getTime() <= new Date(to).getTime(), {
    path: ["to"],
    message: "to tarihi from tarihinden önce olamaz.",
  });

export type RuntimeLifeEventBatchInput = z.infer<typeof runtimeLifeEventBatchSchema>;
export type RuntimeDecisionBatchInput = z.infer<typeof runtimeDecisionBatchSchema>;
export type AgentLifeQueryInput = z.infer<typeof agentLifeQuerySchema>;
