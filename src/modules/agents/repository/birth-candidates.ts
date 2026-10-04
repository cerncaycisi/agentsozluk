import { Prisma } from "@prisma/client";
import type { DatabaseExecutor, TransactionClient } from "@/lib/db/types";
import {
  birthEvidenceLifetimeMs,
  birthEvidenceOriginLimit,
} from "@/modules/agents/domain/birth-policy";

export async function lockBirthScan(tx: TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('agent-birth-candidate-scan', 0))`;
}

export const getBirthSettings = (db: DatabaseExecutor) =>
  db.agentGlobalSettings.findUniqueOrThrow({
    where: { id: "global" },
    select: {
      birthMode: true,
      lastBirthScanAt: true,
      lastBirthCandidateAt: true,
      settingsVersion: true,
      runtimeEnabled: true,
      schedulerEnabled: true,
      publishEnabled: true,
      publicWriteEnabled: true,
      runtimeOperatingMode: true,
    },
  });
export const findPendingBirth = (db: DatabaseExecutor) =>
  db.agentBirthCandidate.findFirst({ where: { status: "PROPOSED" } });
export const findBirthCandidate = (db: DatabaseExecutor, id: string) =>
  db.agentBirthCandidate.findUnique({ where: { id } });
export const createBirthCandidate = (
  tx: TransactionClient,
  data: Prisma.AgentBirthCandidateUncheckedCreateInput,
) => tx.agentBirthCandidate.create({ data });
export const closeBirthCandidate = (
  tx: TransactionClient,
  input: {
    id: string;
    version: number;
    status: "EXPIRED" | "WITHDRAWN" | "REJECTED";
    reason: string;
    now: Date;
  },
) =>
  tx.agentBirthCandidate.updateMany({
    where: { id: input.id, version: input.version, status: "PROPOSED" },
    data: {
      status: input.status,
      version: { increment: 1 },
      closedAt: input.now,
      closureReason: input.reason,
    },
  });
export const recordBirthScan = (tx: TransactionClient, now: Date, created: boolean) =>
  tx.agentGlobalSettings.update({
    where: { id: "global" },
    data: { lastBirthScanAt: now, ...(created ? { lastBirthCandidateAt: now } : {}) },
  });
export const setBirthMode = (tx: TransactionClient, actorId: string, mode: "OFF" | "CANDIDATES") =>
  tx.agentGlobalSettings.update({
    where: { id: "global" },
    data: { birthMode: mode, settingsVersion: { increment: 1 }, updatedById: actorId },
    select: { birthMode: true, settingsVersion: true },
  });
export const findBirthParent = (db: DatabaseExecutor, id: string) =>
  db.agentProfile.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      lifecycleStatus: true,
      currentPersonaVersionId: true,
      user: { select: { status: true, kind: true, role: true, loginDisabled: true } },
      currentPersonaVersion: { select: { id: true, persona: true } },
    },
  });
export const listBirthParentIds = (db: DatabaseExecutor) =>
  db.agentProfile.findMany({
    where: {
      lifecycleStatus: "ACTIVE",
      currentPersonaVersionId: { not: null },
      user: { status: "ACTIVE", kind: "AGENT", role: "USER", loginDisabled: true },
      rewardAssessments: { some: { channel: "QUALITY" } },
    },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 40,
  });
export const listBirthPersonaUniverse = (tx: TransactionClient) =>
  tx.agentProfile.findMany({
    // Emeklilik, kullanılmış kimliği veya mevcut karakteri yeni taslak haline getirmez.
    where: { currentPersonaVersionId: { not: null } },
    select: { currentPersonaVersion: { select: { persona: true } } },
    orderBy: { id: "asc" },
  });
export const findUsedBirthDraftNames = (tx: TransactionClient, names: string[]) =>
  tx.user.findMany({
    where: { usernameNormalized: { in: names } },
    select: { usernameNormalized: true },
  });
export const findRejectedBirthDrafts = (tx: TransactionClient) =>
  tx.agentBirthCandidate.findMany({
    where: { status: "REJECTED" },
    distinct: ["draftKey", "draftVersion"],
    select: { draftKey: true, draftVersion: true },
  });
export const findBirthInWeek = (
  tx: TransactionClient,
  parentProfileId: string,
  weekStart: Date,
  policyVersion: number,
) =>
  tx.agentBirthCandidate.findUnique({
    where: {
      parentProfileId_weekStart_policyVersion: { parentProfileId, weekStart, policyVersion },
    },
    select: { id: true },
  });
export const findBirthRuntimeCredential = (tx: TransactionClient, id: string) =>
  tx.agentCredential.findUnique({
    where: { id },
    select: {
      id: true,
      agentProfileId: true,
      scopes: true,
      expiresAt: true,
      revokedAt: true,
      agentProfile: {
        select: {
          lifecycleStatus: true,
          user: { select: { id: true, kind: true, role: true, status: true, loginDisabled: true } },
        },
      },
    },
  });

export async function findBirthAssessmentHistory(
  db: DatabaseExecutor,
  profileId: string,
  now: Date,
) {
  const since = new Date(now.getTime() - birthEvidenceLifetimeMs);
  // Önce kökenin SON kaydı: verdict/visibility/policy filtresi burada uygulanamaz.
  const ids = await db.$queryRaw<Array<{ id: string }>>`
    SELECT latest."id" FROM (
      SELECT DISTINCT ON ("sourceActKey") "id", "createdAt"
      FROM "agent_reward_assessments"
      WHERE "agentProfileId" = ${profileId}::UUID
        AND "channel" = 'QUALITY'
        AND "sourceAt" > ${since}
      ORDER BY "sourceActKey", "createdAt" DESC, "id" DESC
    ) latest ORDER BY latest."createdAt" DESC, latest."id" DESC LIMIT ${birthEvidenceOriginLimit}
  `;
  if (!ids.length) return { assessments: [], reversedOrigins: new Set<string>(), audits: [] };
  const assessments = await db.agentRewardAssessment.findMany({
    where: { id: { in: ids.map(({ id }) => id) } },
    select: {
      id: true,
      agentProfileId: true,
      entryId: true,
      channel: true,
      mode: true,
      verdict: true,
      createdById: true,
      packageHash: true,
      sourceActKey: true,
      sourceContentHash: true,
      sourceAt: true,
      createdAt: true,
      evidenceSnapshot: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const [reversed, audits] = await Promise.all([
    db.agentRewardAssessment.findMany({
      where: {
        agentProfileId: profileId,
        sourceActKey: { in: assessments.map((row) => row.sourceActKey) },
        reversal: { isNot: null },
      },
      distinct: ["sourceActKey"],
      select: { sourceActKey: true },
    }),
    db.$queryRaw<Array<{ entityId: string; actorId: string | null; metadata: Prisma.JsonValue }>>`
      SELECT "entityId", "actorId", "metadata" FROM "audit_logs"
      WHERE "action" = 'agent.reward.assessed' AND "entityType" = 'AgentRewardAssessment'
        AND "entityId" IN (${Prisma.join(ids.map(({ id }) => Prisma.sql`${id}::UUID`))})
    `,
  ]);
  return { assessments, reversedOrigins: new Set(reversed.map((row) => row.sourceActKey)), audits };
}
