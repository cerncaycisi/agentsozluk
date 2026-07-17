import { z } from "zod";
import { normalizeProfileUsername } from "@/modules/users/domain/profile";

export const publicProfileQuerySchema = z.object({
  username: z.string().transform(normalizeProfileUsername).pipe(z.string().min(1).max(50)),
  skip: z.number().int().nonnegative(),
  take: z.number().int().min(1).max(100),
});

export type PublicProfileQuery = z.infer<typeof publicProfileQuerySchema>;
