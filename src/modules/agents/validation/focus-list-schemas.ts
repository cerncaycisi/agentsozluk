import { z } from "zod";
import {
  focusListAgentMax,
  focusListAgentMin,
  focusListTopicLimit,
} from "@/modules/agents/domain/focus-list";
import { operatorReasonSchema } from "@/modules/agents/validation/schemas";

/*
  `pnpm agent:focus create` girdisi (süreli odak listesi, 19 Ekim 2026). Pencere sınırı
  (en çok 14 gün) uygulama katmanında, oluşturma anına göre denetlenir.
*/
const controlCharacter = /[\u0000-\u001f\u007f-\u009f]/u;

/*
  Başlık operatörün tasarım tablosundaki biçimle verilebilir: publicId sayısı ya da
  `slug--publicId`. Kimlik her durumda sondaki sayıdır.
*/
const topicReferenceSchema = z
  .union([z.number().int().positive(), z.string().trim().min(1).max(300)])
  .transform((value, context) => {
    const match = /^(?:.*--)?(\d{1,18})$/u.exec(String(value));
    if (!match) {
      context.addIssue({ code: "custom", message: "Başlık publicId ya da slug--publicId olmalı." });
      return z.NEVER;
    }
    return BigInt(match[1]!);
  });

export const focusListCreateSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .refine((value) => !controlCharacter.test(value), {
        message: "Etiket kontrol karakteri içeremez.",
      }),
    topics: z.array(topicReferenceSchema).min(1).max(focusListTopicLimit),
    agents: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(64)
          .transform((value) => value.replace(/^@/u, "").toLowerCase()),
      )
      .min(focusListAgentMin)
      .max(focusListAgentMax),
    endsAt: z.string().datetime({ offset: true }),
    reason: operatorReasonSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.topics.map(String)).size !== value.topics.length)
      context.addIssue({ code: "custom", path: ["topics"], message: "Başlık tekrar edemez." });
    if (new Set(value.agents).size !== value.agents.length)
      context.addIssue({ code: "custom", path: ["agents"], message: "Yazar tekrar edemez." });
  });

export type FocusListCreateInput = z.infer<typeof focusListCreateSchema>;
