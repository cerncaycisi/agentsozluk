import { z } from "zod";

const latencyImpactSchema = z
  .object({
    baselineP95Ms: z.number().int().min(0).max(60_000),
    measuredP95Ms: z.number().int().min(0).max(60_000),
    stable: z.boolean(),
  })
  .strict();

export const runtimeCapabilityMeasurementSchema = z
  .object({
    codexVersion: z.string().trim().min(1).max(200),
    promptProfileHash: z.string().regex(/^[a-f0-9]{64}$/u),
    benchmarkRunCount: z.number().int().min(2).max(100),
    p50DurationMs: z.number().int().positive().max(3_600_000),
    p75DurationMs: z.number().int().positive().max(3_600_000),
    p95DurationMs: z.number().int().positive().max(3_600_000),
    maxDurationMs: z.number().int().positive().max(3_600_000),
    successfulActionCount: z.number().int().min(0).max(10_000),
    proposedEntryActionCount: z.number().int().min(0).max(10_000),
    publishedEntries: z.number().int().min(0).max(10_000),
    failureRate: z.number().min(0).max(1),
    duplicateRetryRate: z.number().min(0).max(1),
    singleProcessPeakRssMb: z.number().int().positive().max(65_536),
    dualProcessPeakRssMb: z.number().int().positive().max(65_536).nullable(),
    systemPeakMemoryMb: z.number().int().positive().max(65_536),
    availableMemoryMb: z.number().int().min(0).max(65_536),
    swapInMb: z.number().min(0).max(65_536),
    swapOutMb: z.number().min(0).max(65_536),
    loadAverage1m: z.number().min(0).max(1000),
    dualRunSuccessCount: z.number().int().min(0).max(2),
    oomDetected: z.boolean(),
    swapThrashingDetected: z.boolean(),
    healthStable: z.boolean(),
    readinessStable: z.boolean(),
    appLatencyImpact: latencyImpactSchema,
    databaseLatencyImpact: latencyImpactSchema,
    capacityStatus: z.enum(["UNKNOWN", "HEALTHY", "AT_RISK", "DEGRADED", "OVERLOADED"]),
  })
  .strict()
  .refine(
    ({ p50DurationMs, p75DurationMs, p95DurationMs, maxDurationMs }) =>
      p50DurationMs <= p75DurationMs &&
      p75DurationMs <= p95DurationMs &&
      p95DurationMs <= maxDurationMs,
    { message: "Capability süre yüzdelikleri sıralı olmalıdır." },
  );

export const runtimeCapacityBenchmarkSchema = runtimeCapabilityMeasurementSchema.refine(
  ({ benchmarkRunCount }) => benchmarkRunCount >= 10,
  { path: ["benchmarkRunCount"], message: "Capacity benchmark en az 10 run içermelidir." },
);

export const runtimeConcurrencyCapabilitySchema = runtimeCapabilityMeasurementSchema
  .refine(({ benchmarkRunCount }) => benchmarkRunCount >= 10, {
    path: ["benchmarkRunCount"],
    message: "Concurrency testi güncel en az 10 run benchmark bazını korumalıdır.",
  })
  .refine(({ dualProcessPeakRssMb }) => dualProcessPeakRssMb !== null, {
    path: ["dualProcessPeakRssMb"],
    message: "Concurrency testi dual process peak RSS ölçmelidir.",
  });

export type RuntimeCapabilityMeasurementInput = z.infer<typeof runtimeCapabilityMeasurementSchema>;
