import { z } from "zod";
import { normalizeProfileUsername } from "@/modules/users/domain/profile";

export const publicProfileTabSchema = z.enum(["entries", "topics"]);

export type PublicProfileTab = z.infer<typeof publicProfileTabSchema>;

export const publicProfileQuerySchema = z.object({
  username: z.string().transform(normalizeProfileUsername).pipe(z.string().min(1).max(50)),
  skip: z.number().int().nonnegative(),
  take: z.number().int().min(1).max(100),
  tab: publicProfileTabSchema.default("entries"),
});

export type PublicProfileQuery = z.infer<typeof publicProfileQuerySchema>;
