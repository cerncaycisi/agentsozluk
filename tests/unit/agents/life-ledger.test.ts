import { describe, expect, it } from "vitest";
import {
  agentLifeQuerySchema,
  runtimeDecisionBatchSchema,
  runtimeLifeEventBatchSchema,
} from "@/modules/agents/validation/life-schemas";
import { canonicalLifeEventJson } from "@/modules/agents/repository/life-ledger";
import {
  assertSafeLifeLedgerValue,
  isSafeLifeLedgerText,
} from "@/modules/agents/domain/life-ledger-safety";
import { runtimeFastStateSchema } from "@/modules/agents/validation/runtime-schemas";

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

function validDecisionBatch() {
  return {
    ...validBatch(),
    actions: [
      {
        sequence: 1,
        actionType: "NO_ACTION",
        safeReason: "Görünür kanıt yeni bir public action gerektirmiyor.",
        input: {},
      },
    ],
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

  it("applies decision-journal semantics to atomic decision batches", () => {
    expect(runtimeDecisionBatchSchema.safeParse(validDecisionBatch()).success).toBe(true);

    const duplicate = validDecisionBatch();
    duplicate.payload.decisionJournal[1]!.seq = 1;
    expect(runtimeDecisionBatchSchema.safeParse(duplicate).success).toBe(false);

    const forward = validDecisionBatch();
    forward.payload.decisionJournal[0]!.causedBySeqs = [2];
    expect(runtimeDecisionBatchSchema.safeParse(forward).success).toBe(false);

    const wrongKind = validDecisionBatch();
    wrongKind.payload.actionIntents[0]!.selectedOptionSeq = 1;
    expect(runtimeDecisionBatchSchema.safeParse(wrongKind).success).toBe(false);
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
      "Doğrulama kodu 481205 olarak geldi.",
      "opaque Zx9_Qp2Lm7-Rt4Vn8Ks1Hd6W secret",
      `gömülü digest ${"a".repeat(64)} kalıcı metne giremez`,
      `\u00a0${firstId}\u00a0`,
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

    for (const unsafeKey of [
      `agt_${"c".repeat(43)}`,
      "operator@example.com",
      "https://example.com/private",
      "Zx9_Qp2Lm7-Rt4Vn8Ks1Hd6W",
    ]) {
      expect(() => assertSafeLifeLedgerValue({ topicFatigue: { [unsafeKey]: 0.5 } })).toThrow(
        "UNSAFE_AGENT_LIFE_EVENT_KEY",
      );
      expect(
        runtimeFastStateSchema.safeParse({
          curiosity: 0.5,
          confidence: 0.5,
          topicFatigue: { [unsafeKey]: 0.5 },
        }).success,
      ).toBe(false);
    }
  });

  it("allows canonical identifiers only in typed identifier fields", () => {
    expect(isSafeLifeLedgerText(firstId)).toBe(false);
    expect(isSafeLifeLedgerText("12345678-1234-4123-8123-123456789012")).toBe(false);
    expect(isSafeLifeLedgerText("a".repeat(64))).toBe(false);
    expect(isSafeLifeLedgerText("Zx9_Qp2Lm7-Rt4Vn8Ks1Hd6W")).toBe(false);
    expect(isSafeLifeLedgerText("481205")).toBe(false);
    expect(() => assertSafeLifeLedgerValue({ summary: "a".repeat(64) })).toThrow(
      "UNSAFE_AGENT_LIFE_EVENT_VALUE",
    );
    expect(() => assertSafeLifeLedgerValue({ actionId: firstId })).not.toThrow();
    expect(() => assertSafeLifeLedgerValue({ contentHash: "a".repeat(64) })).not.toThrow();
    expect(() =>
      assertSafeLifeLedgerValue({
        productionGitSha: "a".repeat(40),
        mainGitSha: "b".repeat(40),
        backupChecksum: "c".repeat(64),
        restoreFingerprint: "d".repeat(64),
      }),
    ).not.toThrow();
    expect(() => assertSafeLifeLedgerValue({ startedEventId: "1234567" })).not.toThrow();
    expect(() =>
      assertSafeLifeLedgerValue({
        smokeProfileId: firstId,
        activeAgentIds: [firstId, secondId],
        ciRunId: "12345",
        checkpointEventIds: ["1234567", "1234568"],
      }),
    ).not.toThrow();
    for (const unsafeField of ["secretId", "credentialTokenHash", "apiKeyDigest", "rawPromptHash"])
      for (const unsafeValue of ["hunter2", "a".repeat(64)])
        expect(() => assertSafeLifeLedgerValue({ [unsafeField]: unsafeValue })).toThrow(
          "SENSITIVE_AGENT_LIFE_EVENT_KEY",
        );
    for (const unsafeValue of ["hunter2", "a".repeat(64)])
      expect(() => assertSafeLifeLedgerValue({ fooFingerprint: unsafeValue })).toThrow(
        "UNSAFE_AGENT_LIFE_EVENT_KEY",
      );
    expect(() => assertSafeLifeLedgerValue({ credentialId: "hunter2" })).toThrow(
      "UNSAFE_AGENT_LIFE_EVENT_VALUE",
    );
    expect(() => assertSafeLifeLedgerValue({ arbitraryId: "hunter2" })).toThrow(
      "UNSAFE_AGENT_LIFE_EVENT_VALUE",
    );
    for (const invalidTypedValue of [123, true, { safe: "hello" }]) {
      expect(() => assertSafeLifeLedgerValue({ actionId: invalidTypedValue })).toThrow(
        "UNSAFE_AGENT_LIFE_EVENT_VALUE",
      );
      expect(() => assertSafeLifeLedgerValue({ contentHash: invalidTypedValue })).toThrow(
        "UNSAFE_AGENT_LIFE_EVENT_VALUE",
      );
      expect(() => assertSafeLifeLedgerValue({ normalizedDomain: invalidTypedValue })).toThrow(
        "UNSAFE_AGENT_LIFE_EVENT_VALUE",
      );
    }
    expect(() => assertSafeLifeLedgerValue({ credentialId: 481205 })).toThrow(
      "UNSAFE_AGENT_LIFE_EVENT_VALUE",
    );
    expect(() => assertSafeLifeLedgerValue({ checkpointEventIds: ["12", 13] })).toThrow(
      "UNSAFE_AGENT_LIFE_EVENT_VALUE",
    );
    for (const [domainKey, unsafeDomain] of [
      ["normalizedDomain", "a".repeat(64)],
      ["sourceDomain", "Zx9Qp2Lm7Rt4Vn8Ks1Hd6W"],
      ["normalizedDomain", "-..-"],
    ] as const)
      expect(() => assertSafeLifeLedgerValue({ [domainKey]: unsafeDomain })).toThrow(
        "UNSAFE_AGENT_LIFE_EVENT_VALUE",
      );
    expect(() => assertSafeLifeLedgerValue({ normalizedDomain: "www.example.com" })).not.toThrow();
    expect(() =>
      assertSafeLifeLedgerValue({ normalizedDomain: "[2606:4700:4700::1111]" }),
    ).not.toThrow();
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
