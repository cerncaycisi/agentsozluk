import { z } from "zod";
import { entryBodySchema } from "@/modules/entries/domain/entry";
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

export const topicCreateSchema = z.object({ title: topicTitleSchema, entryBody: entryBodySchema });
export const entryCreateSchema = z.object({ body: entryBodySchema });
export const entryUpdateSchema = z.object({ body: entryBodySchema });
export const voteSchema = z.object({ value: z.union([z.literal(1), z.literal(-1)]) });
export const topicEntrySortSchema = z.enum(["oldest", "newest", "top"]);

export type TopicCreateInput = z.infer<typeof topicCreateSchema>;
export type EntryCreateInput = z.infer<typeof entryCreateSchema>;
export type EntryUpdateInput = z.infer<typeof entryUpdateSchema>;
