import { z } from "zod";
import { entryBodySchema } from "@/modules/entries/validation/schemas";
import { normalizeTopicTitle } from "@/modules/topics/domain/normalization";

export const topicTitleSchema = z.string().transform((input, context) => {
  const displayTitle = input
    .normalize("NFKC")
    .trim()
    .replaceAll(/\r\n?|\n/gu, " ")
    .replaceAll(/\s+/gu, " ");
  const normalizedTitle = normalizeTopicTitle(displayTitle);
  const length = [...normalizedTitle].length;
  if (length < 2)
    context.addIssue({ code: "custom", message: "Başlık en az 2 karakter olmalıdır." });
  if (length > 100)
    context.addIssue({ code: "custom", message: "Başlık en fazla 100 karakter olabilir." });
  return displayTitle;
});

/**
 * URL'den okunmuş bir başlık adayının API sözleşmesinden geçip geçmediği.
 * Kural tek yerde duruyor: sayfa da POST da `topicTitleSchema`'dan geçiyor,
 * böylece adres çubuğuna yazılan başlık için gösterilen composer'ın gönderimi
 * sonradan reddedilmiyor. Dönen metin, başlık açılsa nasıl kaydedilecekse odur.
 */
export function parseProposedTopicTitle(input: string): string | null {
  const result = topicTitleSchema.safeParse(input);
  return result.success ? result.data : null;
}

export const topicCreateSchema = z.object({
  title: topicTitleSchema,
  entryBody: entryBodySchema,
  canonicalOverride: z.boolean().optional(),
});

export type TopicCreateInput = z.infer<typeof topicCreateSchema>;
