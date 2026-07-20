import { describe, expect, it } from "vitest";
import { invalidateAgentMemorySchema } from "@/modules/agents/validation/memory-schemas";
import { runtimeCredentialRotationSchema } from "@/modules/agents/validation/runtime-schemas";
import {
  adminDailyPlanRegenerationSchema,
  agentRunCommandSchema,
  cancelPendingAgentRunsSchema,
  dailyPlanGenerationSchema,
} from "@/modules/agents/validation/scheduling-schemas";
import {
  agentSourceAdminUpdateSchema,
  globalSettingsUpdateSchema,
  lifecycleChangeSchema,
  operatorReasonSchema,
  personaRollbackSchema,
  runtimeControlSchema,
  updateAgentSchema,
} from "@/modules/agents/validation/schemas";

const safeReason = "Planlanan bakım penceresi nedeniyle kontrollü durdurma uygulanıyor.";
const unsafeReason = "Operasyon notu token=abc123 değerini içeriyor.";

describe("secret-safe operator reason validation", () => {
  it("trims safe reasons and enforces the 10-1000 character boundary", () => {
    expect(operatorReasonSchema.parse(`  ${"a".repeat(10)}  `)).toBe("a".repeat(10));
    expect(operatorReasonSchema.safeParse("a".repeat(9)).success).toBe(false);
    expect(operatorReasonSchema.safeParse("a".repeat(1000)).success).toBe(true);
    expect(operatorReasonSchema.safeParse("a".repeat(1001)).success).toBe(false);
    expect(operatorReasonSchema.safeParse(safeReason).success).toBe(true);
  });

  it.each([
    "Kontrollü bakım\nikinci satır",
    `Kontrollü bakım${String.fromCharCode(0x85)}ikinci bölüm`,
    "İnceleme https://example.com/operator kaydında yapıldı.",
    "İnceleme www.example.com/operator kaydında yapıldı.",
    "İnceleme operator@example.com hesabıyla yapıldı.",
    "Kontrollü <strong>bakım</strong> gerekçesi.",
    "Operasyon notu api_key: abc123 değerini içeriyor.",
    "Operasyon notu OPENAI_API_KEY=abc123 değerini içeriyor.",
    "Operasyon notu password = topsecret değerini içeriyor.",
    'Operasyon notu {"password":"topsecret"} değerini içeriyor.',
    "Operasyon notu signature=deadbeef değerini içeriyor.",
    "Operasyon notu x-amz-signature=deadbeef değerini içeriyor.",
    `Bearer ${"a".repeat(32)}`,
    "Basic dXNlcjpwYXNz",
    `sk-proj-${"b".repeat(24)}`,
    `agt_${"c".repeat(43)}`,
    "eyJaaaaaaaa.bbbbbbbb.cccccccc",
    ["-----BEGIN", "PRIVATE KEY----- gizli veri"].join(" "),
    "Operasyon notu 481205 değerini içeriyor.",
    "Operasyon notu Zx9_Qp2Lm7-Rt4Vn8Ks1Hd6W değerini içeriyor.",
  ])("rejects unsafe durable text: %s", (reason) => {
    expect(operatorReasonSchema.safeParse(reason).success).toBe(false);
  });

  it("rejects control characters even when trimming would otherwise remove them", () => {
    expect(operatorReasonSchema.safeParse(`${safeReason}\n`).success).toBe(false);
    expect(operatorReasonSchema.safeParse(`\t${safeReason}`).success).toBe(false);
  });

  it("reuses the boundary across persistent operator reason fields", () => {
    const parsers: Array<[string, (reason: string) => boolean]> = [
      [
        "agent update",
        (reason) =>
          updateAgentSchema.safeParse({ displayName: "Güncel Ad", changeSummary: reason }).success,
      ],
      [
        "lifecycle",
        (reason) => lifecycleChangeSchema.safeParse({ status: "PAUSED", reason }).success,
      ],
      [
        "persona rollback",
        (reason) => personaRollbackSchema.safeParse({ version: 1, reason }).success,
      ],
      [
        "global settings",
        (reason) =>
          globalSettingsUpdateSchema.safeParse({
            expectedSettingsVersion: 1,
            changeReason: reason,
            schedulerEnabled: false,
          }).success,
      ],
      ["runtime control", (reason) => runtimeControlSchema.safeParse({ reason }).success],
      [
        "source administration",
        (reason) => agentSourceAdminUpdateSchema.safeParse({ adminPinned: true, reason }).success,
      ],
      [
        "memory invalidation",
        (reason) =>
          invalidateAgentMemorySchema.safeParse({
            reason,
            confirmation: "INVALIDATE_AGENT_MEMORY",
          }).success,
      ],
      ["daily plan", (reason) => dailyPlanGenerationSchema.safeParse({ reason }).success],
      [
        "daily plan regeneration",
        (reason) => adminDailyPlanRegenerationSchema.safeParse({ reason }).success,
      ],
      ["agent run", (reason) => agentRunCommandSchema.safeParse({ reason }).success],
      [
        "bulk run control",
        (reason) =>
          cancelPendingAgentRunsSchema.safeParse({
            reason,
            confirmation: "CANCEL_PENDING_WRITE_RUNS",
          }).success,
      ],
      [
        "credential rotation",
        (reason) => runtimeCredentialRotationSchema.safeParse({ reason }).success,
      ],
    ];

    for (const [name, parse] of parsers) {
      expect(parse(safeReason), `${name} should accept a safe reason`).toBe(true);
      expect(parse(unsafeReason), `${name} should reject an unsafe reason`).toBe(false);
    }
  });
});
