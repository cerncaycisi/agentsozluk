import { z } from "zod";

const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const gitSha = z.string().regex(/^[a-f0-9]{40}$/u);
const requiredTrue = z.literal(true);

const checkpointBase = {
  attemptId: uuid,
  commandId: uuid,
} as const;

export const productionRolloutGate9Schema = z
  .object({
    ...checkpointBase,
    kind: z.literal("GATE9_ACCEPTED"),
    smokeProfileId: uuid,
    readOnlyRunId: uuid,
    dryRunId: uuid,
    normalWakeRunId: uuid,
    normalWakeEntryId: uuid,
    reportId: uuid,
    pendingCancelledRunId: uuid,
    gracefulStoppedRunId: uuid,
    healthStatus: z.literal(200),
    readinessStatus: z.literal(200),
    publicSurfacesPassed: requiredTrue,
    humanV1FlowPassed: requiredTrue,
    roleDenialPassed: requiredTrue,
    metadataLeakCount: z.literal(0),
    takedownRestorePassed: requiredTrue,
  })
  .strict();

export const productionRolloutGate10StartSchema = z
  .object({ ...checkpointBase, kind: z.literal("GATE10_STARTED") })
  .strict();

export const productionRolloutGate10SampleSchema = z
  .object({
    ...checkpointBase,
    kind: z.literal("GATE10_SAMPLED"),
    sampleIndex: z.number().int().min(0).max(4),
    workerProcessCount: z.literal(1),
    workerRestartCount: z.number().int().nonnegative(),
    workerRssMb: z.number().int().positive(),
    healthStatus: z.literal(200),
    readinessStatus: z.literal(200),
    metadataLeakCount: z.literal(0),
    takedownPassed: requiredTrue,
  })
  .strict();

export const productionRolloutGate10AcceptSchema = z
  .object({ ...checkpointBase, kind: z.literal("GATE10_ACCEPTED") })
  .strict();

export const productionRolloutGate11StartSchema = z
  .object({ ...checkpointBase, kind: z.literal("GATE11_STARTED") })
  .strict();

export const productionRolloutGate11AcceptSchema = z
  .object({ ...checkpointBase, kind: z.literal("GATE11_ACCEPTED") })
  .strict();

export const productionRolloutGate12PreRebootSchema = z
  .object({
    ...checkpointBase,
    kind: z.literal("GATE12_PRE_REBOOT"),
    bootIdHash: sha256,
    ledgerIntegrityHash: sha256,
    ledgerRowCount: z.number().int().nonnegative(),
    workerProcessCount: z.literal(1),
    runtimeServiceActive: requiredTrue,
    productionGitSha: gitSha,
    mainGitSha: gitSha,
    backupChecksum: sha256,
    restoreFingerprint: sha256,
  })
  .strict()
  .refine(({ productionGitSha, mainGitSha }) => productionGitSha === mainGitSha, {
    path: ["productionGitSha"],
    message: "Production ve main Git SHA eşleşmelidir.",
  });

export const productionRolloutGate12PostRebootSchema = z
  .object({
    ...checkpointBase,
    kind: z.literal("GATE12_POST_REBOOT"),
    bootIdHash: sha256,
    ledgerIntegrityHash: sha256,
    ledgerRowCount: z.number().int().nonnegative(),
    workerProcessCount: z.literal(1),
    runtimeServiceActive: requiredTrue,
    appContainerRunning: requiredTrue,
    databaseContainerRunning: requiredTrue,
    healthStatus: z.literal(200),
    readinessStatus: z.literal(200),
    productionGitSha: gitSha,
    mainGitSha: gitSha,
    ciRunId: z.string().regex(/^\d{1,30}$/u),
    ciPassed: requiredTrue,
  })
  .strict()
  .refine(({ productionGitSha, mainGitSha }) => productionGitSha === mainGitSha, {
    path: ["productionGitSha"],
    message: "Production ve main Git SHA eşleşmelidir.",
  });

export const productionRolloutGate12AcceptSchema = z
  .object({
    ...checkpointBase,
    kind: z.literal("GATE12_ACCEPTED"),
    postResumeScheduledRunId: uuid,
    repeatedHumanSmokePassed: requiredTrue,
    repeatedRoleDenialPassed: requiredTrue,
    repeatedMetadataScanPassed: requiredTrue,
    repeatedTakedownRestorePassed: requiredTrue,
    noDuplicateLeaseOrCatchUpBurst: requiredTrue,
  })
  .strict();

export const productionRolloutCheckpointSchema = z.discriminatedUnion("kind", [
  productionRolloutGate9Schema,
  productionRolloutGate10StartSchema,
  productionRolloutGate10SampleSchema,
  productionRolloutGate10AcceptSchema,
  productionRolloutGate11StartSchema,
  productionRolloutGate11AcceptSchema,
  productionRolloutGate12PreRebootSchema,
  productionRolloutGate12PostRebootSchema,
  productionRolloutGate12AcceptSchema,
]);

export type ProductionRolloutCheckpointInput = z.infer<typeof productionRolloutCheckpointSchema>;
