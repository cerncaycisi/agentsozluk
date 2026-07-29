import type { Prisma } from "@prisma/client";
import type { DatabaseExecutor } from "@/lib/db/types";

export function listRuntimeCredentialRosterRecords(client: DatabaseExecutor, now: Date) {
  return client.agentCredential.findMany({
    where: {
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      agentProfile: {
        lifecycleStatus: { in: ["DRAFT", "PAUSED", "ACTIVE"] },
        user: {
          kind: "AGENT",
          role: "USER",
          status: "ACTIVE",
          loginDisabled: true,
        },
      },
    },
    select: {
      id: true,
      agentProfileId: true,
      prefix: true,
      runtimeEnrollmentCipher: true,
    },
    orderBy: [{ agentProfileId: "asc" }, { createdAt: "desc" }, { id: "asc" }],
  });
}

export function upsertRuntimeCredentialSync(
  transaction: Prisma.TransactionClient,
  input: {
    workerId: string;
    desiredFingerprint: string;
    loadedCredentialIds: string[];
    syncedAt: Date;
    workerTelemetry?: {
      bootId: string;
      processingLanes: number;
      codexVersion: string;
      promptProfileHash: string;
      startedAt: Date;
      restartCount: number;
    };
  },
) {
  const { workerTelemetry, ...roster } = input;
  return transaction.agentRuntimeCredentialSync.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      ...roster,
      ...(workerTelemetry
        ? {
            workerBootId: workerTelemetry.bootId,
            processingLanes: workerTelemetry.processingLanes,
            codexVersion: workerTelemetry.codexVersion,
            promptProfileHash: workerTelemetry.promptProfileHash,
            workerStartedAt: workerTelemetry.startedAt,
            workerRestartCount: workerTelemetry.restartCount,
          }
        : {}),
    },
    update: {
      ...roster,
      ...(workerTelemetry
        ? {
            workerBootId: workerTelemetry.bootId,
            processingLanes: workerTelemetry.processingLanes,
            codexVersion: workerTelemetry.codexVersion,
            promptProfileHash: workerTelemetry.promptProfileHash,
            workerStartedAt: workerTelemetry.startedAt,
            workerRestartCount: workerTelemetry.restartCount,
          }
        : {}),
    },
  });
}

export function getRuntimeCredentialSync(client: DatabaseExecutor) {
  return client.agentRuntimeCredentialSync.findUnique({ where: { id: "global" } });
}

export function getCurrentRuntimeCredential(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
) {
  return transaction.agentCredential.findFirst({
    where: {
      agentProfileId,
      revokedAt: null,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, prefix: true, runtimeEnrollmentCipher: true },
  });
}

export async function getRuntimeCredentialReadiness(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
  now: Date,
) {
  const [credential, sync] = await Promise.all([
    getCurrentRuntimeCredential(transaction, agentProfileId),
    getRuntimeCredentialSync(transaction),
  ]);
  if (!credential)
    return {
      managed: false,
      mode: "NONE" as const,
      ready: false,
      credentialId: null,
      syncedAt: sync?.syncedAt ?? null,
      reason: "CREDENTIAL_NOT_FOUND" as const,
    };
  const managed = credential.runtimeEnrollmentCipher !== null;
  if (!sync && !managed)
    return {
      managed: false,
      mode: "LEGACY" as const,
      ready: true,
      credentialId: credential.id,
      syncedAt: null,
      reason: "LEGACY_UNVERIFIED" as const,
    };
  const fresh = Boolean(sync && now.getTime() - sync.syncedAt.getTime() <= 120_000);
  const loaded = Boolean(sync?.loadedCredentialIds.includes(credential.id));
  return {
    managed,
    mode: managed ? ("MANAGED" as const) : ("LEGACY" as const),
    ready: fresh && loaded,
    credentialId: credential.id,
    syncedAt: sync?.syncedAt ?? null,
    reason: !sync
      ? ("ROSTER_NOT_SYNCED" as const)
      : !fresh
        ? ("ROSTER_SYNC_STALE" as const)
        : !loaded
          ? ("CREDENTIAL_NOT_LOADED" as const)
          : ("READY" as const),
  };
}
