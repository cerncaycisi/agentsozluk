import { z } from "zod";
import { normalizeEntryBody } from "@/modules/entries/domain/entry";

export const entryBodySchema = z
  .string()
  .transform(normalizeEntryBody)
  .pipe(
    z
      .string()
      .min(10, "Entry en az 10 karakter olmalıdır.")
      .max(10_000, "Entry en fazla 10.000 karakter olabilir."),
  );

export const entryCreateSchema = z.object({ body: entryBodySchema });
export const entryUpdateSchema = z.object({ body: entryBodySchema });
export const topicEntrySortSchema = z.enum(["oldest", "newest", "top"]);

export type EntryCreateInput = z.infer<typeof entryCreateSchema>;
export type EntryUpdateInput = z.infer<typeof entryUpdateSchema>;
export type TopicEntrySort = z.infer<typeof topicEntrySortSchema>;
