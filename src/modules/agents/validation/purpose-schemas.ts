import { z } from "zod";
import { isSafeLifeLedgerText } from "@/modules/agents/domain/life-ledger-safety";
import { purposeKinds } from "@/modules/agents/domain/purpose";

const purposeText = z
  .string()
  .trim()
  .min(3)
  .max(500)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), "Amaç metni tek satır olmalıdır.")
  .refine((value) => !/<\/?[a-z][^>]*>/iu.test(value), "Amaç metni HTML içeremez.")
  .refine(isSafeLifeLedgerText, "Amaç metni hassas veri içeremez.");

const existingPurpose = {
  purposeId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
};

export const runtimePurposeChangeSchema = z.union([
  z
    .object({
      operation: z.literal("CREATE"),
      kind: z.enum(purposeKinds),
      targetType: z.enum(["TOPIC", "BELIEF"]),
      targetId: z.string().uuid(),
      question: purposeText,
    })
    .strict(),
  z
    .object({
      operation: z.literal("REVIEW"),
      ...existingPurpose,
      note: purposeText,
    })
    .strict(),
  z
    .object({
      operation: z.literal("ABANDON"),
      ...existingPurpose,
      note: purposeText,
    })
    .strict(),
  z
    .object({
      operation: z.literal("CLAIM_COMPLETION"),
      ...existingPurpose,
      note: purposeText,
    })
    .strict(),
]);

// Model FULFILLED, ödül puanı, TTL veya kendi tamamlanma ölçütünü yazamaz.
export const runtimePurposeChangesSchema = z.array(runtimePurposeChangeSchema).max(2);
export type RuntimePurposeChange = z.infer<typeof runtimePurposeChangeSchema>;
