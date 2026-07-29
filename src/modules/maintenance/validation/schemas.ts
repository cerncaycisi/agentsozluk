import { z } from "zod";
import {
  MAX_EXPIRED_RECORD_BATCHES,
  MAX_EXPIRED_RECORD_BATCH_SIZE,
} from "@/modules/maintenance/domain/expired-operational-records";

export const expiredRecordCleanupOptionsSchema = z
  .object({
    now: z.date(),
    batchSize: z.number().int().min(1).max(MAX_EXPIRED_RECORD_BATCH_SIZE),
    maxBatches: z.number().int().min(1).max(MAX_EXPIRED_RECORD_BATCHES),
  })
  .strict();
