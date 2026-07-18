import { describe, expect, it } from "vitest";
import {
  agentLifeQuerySchema,
  runtimeLifeEventBatchSchema,
} from "@/modules/agents/validation/life-schemas";
import { canonicalLifeEventJson } from "@/modules/agents/repository/life-ledger";
import {
  assertSafeLifeLedgerValue,
  isSafeLifeLedgerText,
} from "@/modules/agents/domain/life-ledger-safety";

const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";

function validBatch() {
  return {
    workerId: "worker-1",
    leaseToken: "a".repeat(43),
    payload: {
      observations: [
        {
          subjectType: "ENTRY",
          subjectId: firstId,
          summary: "Entry içindeki iddia ve karşı kanıt birlikte gözlendi.",
          salience: 0.8,
          provenance: {
            evidenceType: "USER_ENTRY",
            evidenceIds: [firstId],
            shortRationale: "Görünür entry doğrudan kanıt olarak kullanıldı.",
          },
        },
      ],
      memoryCandidates: [],
      decisionJournal: [
        {
          seq: 1,
          kind: "OPTION_CONSIDERED",
          subject: "Yanıt vermek",
          summary: "Kısa ve kanıta bağlı bir yanıt seçeneği değerlendirildi.",
          confidence: 0.7,
          evidenceIds: [firstId],
          causedBySeqs: [],
        },
        {
          seq: 2,
          kind: "OPTION_SELECTED",
          subject: "Yanıtı seçmek",
          summary: "Görünür kanıt nedeniyle kontrollü yanıt seçildi.",
          confidence: 0.82,
          evidenceIds: [firstId],
          causedBySeqs: [1],
        },
      ],
      actionIntents: [
        {
          sequence: 1,
          desire: 0.75,
          expectedOutcome: "Konuya yeni ve doğrulanabilir bir çerçeve eklemek.",
          selectedOptionSeq: 2,
        },
      ],
    },
  };
}

describe("agent life ledger contracts", () => {
  it("accepts an ordered decision journal and exact action-intent link", () => {
    expect(runtimeLifeEventBatchSchema.parse(validBatch())).toMatchObject({
      payload: { actionIntents: [{ selectedOptionSeq: 2 }] },
    });
  });

  it("rejects forward causal references and non-selected action links", () => {
    const forward = validBatch();
    forward.payload.decisionJournal[0]!.causedBySeqs = [2];
    expect(runtimeLifeEventBatchSchema.safeParse(forward).success).toBe(false);

    const wrongKind = validBatch();
    wrongKind.payload.actionIntents[0]!.selectedOptionSeq = 1;
    expect(runtimeLifeEventBatchSchema.safeParse(wrongKind).success).toBe(false);
  });

  it("rejects empty batches, hidden markup and duplicate action sequences", () => {
    const empty = validBatch();
    empty.payload = {
      observations: [],
      memoryCandidates: [],
      decisionJournal: [],
      actionIntents: [],
    };
    expect(runtimeLifeEventBatchSchema.safeParse(empty).success).toBe(false);

    const duplicate = validBatch();
    duplicate.payload.actionIntents.push({
      sequence: 1,
      desire: 0.1,
      expectedOutcome: "Aynı sequence tekrar edilmemeli.",
      selectedOptionSeq: 2,
    });
    expect(runtimeLifeEventBatchSchema.safeParse(duplicate).success).toBe(false);

    const markup = validBatch();
    markup.payload.decisionJournal[0]!.summary = "<script>gizli</script>";
    expect(runtimeLifeEventBatchSchema.safeParse(markup).success).toBe(false);
  });

  it("rejects raw reasoning fields, credentials, e-mail and control characters", () => {
    for (const forbiddenField of [
      "chainOfThought",
      "internalMonologue",
      "rawPrompt",
      "rawReasoning",
    ]) {
      const raw = validBatch() as ReturnType<typeof validBatch> & Record<string, unknown>;
      raw.payload = { ...raw.payload, [forbiddenField]: "must never be persisted" } as never;
      expect(runtimeLifeEventBatchSchema.safeParse(raw).success).toBe(false);
    }

    for (const unsafeSummary of [
      `Bearer ${"a".repeat(32)}`,
      `api_key=${"b".repeat(24)}`,
      `agt_${"c".repeat(43)}`,
      "https://example.com/feed?X-Amz-Signature=secret-value",
      "operator@example.com",
      "güvenli görünen\nama satır sonlu metin",
    ]) {
      const unsafe = validBatch();
      unsafe.payload.decisionJournal[0]!.summary = unsafeSummary;
      expect(runtimeLifeEventBatchSchema.safeParse(unsafe).success).toBe(false);
      expect(isSafeLifeLedgerText(unsafeSummary)).toBe(false);
    }

    expect(() =>
      assertSafeLifeLedgerValue({ metadata: { leaseToken: "not-even-a-real-token" } }),
    ).toThrow("SENSITIVE_AGENT_LIFE_EVENT_KEY");
    const privateKeyMarker = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
    expect(() =>
      assertSafeLifeLedgerValue({ summary: `${privateKeyMarker}${"x".repeat(20)}` }),
    ).toThrow("UNSAFE_AGENT_LIFE_EVENT_VALUE");
  });

  it("canonicalizes object keys and validates bounded cursor filters", () => {
    expect(canonicalLifeEventJson({ z: secondId, a: { y: 2, x: 1 } })).toBe(
      canonicalLifeEventJson({ a: { x: 1, y: 2 }, z: secondId }),
    );
    expect(
      agentLifeQuerySchema.parse({
        cursor: "42",
        limit: "200",
        from: "2026-07-18T10:00:00.000Z",
        to: "2026-07-18T11:00:00.000Z",
      }),
    ).toMatchObject({ cursor: "42", limit: 200, format: "json" });
    expect(agentLifeQuerySchema.safeParse({ cursor: "-1" }).success).toBe(false);
    expect(agentLifeQuerySchema.safeParse({ cursor: "9223372036854775807" }).success).toBe(true);
    expect(agentLifeQuerySchema.safeParse({ cursor: "9223372036854775808" }).success).toBe(false);
  });
});
