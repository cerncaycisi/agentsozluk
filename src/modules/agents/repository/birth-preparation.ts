import type { DatabaseExecutor, TransactionClient, InputJsonObject } from "@/lib/db/types";
import { rewardObject } from "@/modules/agents/domain/rewards";
import { canonicalRequestHash } from "@/modules/idempotency/domain/idempotency";

export const findManagedBirth = (db: DatabaseExecutor) =>
  db.agentBirthCandidate.findFirst({
    where: { childProfileId: { not: null } },
    orderBy: { createdAt: "asc" },
  });

export const findManagedBirthForChild = (db: DatabaseExecutor, childProfileId: string) =>
  db.agentBirthCandidate.findUnique({ where: { childProfileId } });

export async function loadBirthRootEvidence(tx: TransactionClient, profileId: string) {
  const profile = await tx.agentProfile.findUnique({
    where: { id: profileId },
    select: { id: true, createdAt: true },
  });
  if (!profile) return null;
  const [initial, creations, genesis, child] = await Promise.all([
    tx.agentPersonaVersion.findUnique({
      where: { agentProfileId_version: { agentProfileId: profileId, version: 1 } },
      select: { id: true, persona: true, changeOrigin: true, createdAt: true },
    }),
    tx.auditLog.findMany({
      where: { action: "agent.created", entityType: "AgentProfile", entityId: profileId },
      select: { id: true, metadata: true, createdAt: true, actorId: true, requestId: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 2,
    }),
    tx.agentRuntimeEvent.findMany({
      where: { agentProfileId: profileId, eventType: "LIFE_GENESIS_SNAPSHOT" },
      select: { id: true, metadata: true, createdAt: true, occurredAt: true, eventHash: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 2,
    }),
    findManagedBirthForChild(tx, profileId),
  ]);
  // CUSTOM yaratılmış olsa bile yönetilen soy çocuğu bağımsız kök olmaz.
  if (child) return null;
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    profileId,
    createdAt: profile.createdAt,
    initial,
    creations: creations.map((row) => ({
      id: row.id,
      method: text(rewardObject(row.metadata).method),
      createdAt: row.createdAt,
      contentHash: canonicalRequestHash(row),
    })),
    genesis: genesis.map((row) => ({
      id: row.id.toString(),
      method: text(rewardObject(row.metadata).method),
      origin: text(rewardObject(row.metadata).origin),
      createdAt: row.createdAt,
      contentHash: canonicalRequestHash({ ...row, id: row.id.toString() }),
    })),
  };
}

export async function birthPreparationPopulation(tx: TransactionClient, rootProfileId: string) {
  const [nonRetiredProfiles, root, descendants, managedChildren] = await Promise.all([
    tx.agentProfile.count({ where: { lifecycleStatus: { not: "RETIRED" } } }),
    tx.agentProfile.count({ where: { id: rootProfileId, lifecycleStatus: { not: "RETIRED" } } }),
    tx.agentBirthCandidate.count({
      where: { rootProfileId, childProfile: { lifecycleStatus: { not: "RETIRED" } } },
    }),
    tx.agentBirthCandidate.count({ where: { childProfileId: { not: null } } }),
  ]);
  return { nonRetiredProfiles, livingRootMembers: root + descendants, managedChildren };
}

export const recordBirthPreparation = (
  tx: TransactionClient,
  input: {
    candidateId: string;
    expectedVersion: number;
    childProfileId: string;
    rootProfileId: string;
    preparedAt: Date;
    preparationExpiresAt: Date;
    preparationEvidence: InputJsonObject;
  },
) =>
  tx.agentBirthCandidate.updateMany({
    where: { id: input.candidateId, version: input.expectedVersion, status: "PROPOSED" },
    data: {
      status: "PREPARED",
      version: { increment: 1 },
      childProfileId: input.childProfileId,
      rootProfileId: input.rootProfileId,
      preparedAt: input.preparedAt,
      preparationExpiresAt: input.preparationExpiresAt,
      preparationEvidence: input.preparationEvidence,
      closedAt: input.preparedAt,
      closureReason: "PREPARED",
    },
  });
