import { z } from "zod";

/** Identifiers are hashed before persistence, but must still be bounded input. */
export const rateLimitIdentifierSchema = z.string().min(1).max(4096);
