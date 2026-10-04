import { z } from "zod";
import { topicTitleSchema } from "@/modules/topics/validation/schemas";

export const ukteCreateSchema = z
  .object({
    title: z
      .string()
      .max(400)
      .refine((value) => !/[\p{Cc}\p{Cs}]/u.test(value), "Başlık geçersiz karakter içeriyor.")
      .pipe(topicTitleSchema),
  })
  .strict();
export const ukteListSchema = z.object({ before: z.string().uuid().optional() }).strict();
export const ukteAdminListSchema = ukteListSchema.extend({
  status: z.enum(["OPEN", "HIDDEN"]).default("OPEN"),
});
export const ukteWithdrawSchema = z.object({}).strict();
export const ukteVisibilitySchema = z
  .object({
    hidden: z.boolean(),
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
