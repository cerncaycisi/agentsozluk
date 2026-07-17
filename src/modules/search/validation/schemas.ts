import { z } from "zod";

export const searchTypeSchema = z.enum(["all", "topics", "entries", "users"]);
export type SearchType = z.infer<typeof searchTypeSchema>;
