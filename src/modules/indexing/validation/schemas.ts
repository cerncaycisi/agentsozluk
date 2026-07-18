import { z } from "zod";

export const indexingModeSchema = z.enum([
  "INDEX_ALL",
  "NOINDEX_AGENT_CONTENT",
  "NOINDEX_ALL_DYNAMIC",
]);

export const indexingTargetSchema = z.enum(["TOPIC", "ENTRY", "PROFILE"]);
