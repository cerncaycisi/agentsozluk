import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import { runtimeCredentialRosterFingerprint } from "@/modules/agents/domain/runtime-credential-enrollment";
import {
  listRuntimeCredentialRosterRecords,
  upsertRuntimeCredentialSync,
} from "@/modules/agents/repository/runtime-credentials";
import { lockAgentSettings } from "@/modules/agents/repository/control-plane";
import type { z } from "zod";
import type { runtimeCredentialRosterAckSchema } from "@/modules/agents/validation/runtime-schemas";

type RuntimeCredentialRosterAckInput = z.infer<typeof runtimeCredentialRosterAckSchema>;

function rosterFingerprint(
  records: Array<{ id: string; agentProfileId: string; prefix: string }>,
): string {
  return runtimeCredentialRosterFingerprint(
    records.map(({ id, agentProfileId, prefix }) => ({
      credentialId: id,
      agentProfileId,
      prefix,
    })),
  );
}

export async function getRuntimeCredentialRoster(
  client: DatabaseExecutor,
  _principal: RuntimePrincipal,
  workerId: string,
  now = new Date(),
) {
  const records = await listRuntimeCredentialRosterRecords(client, now);
  const entries = records.flatMap((record) =>
    record.runtimeEnrollmentCipher
      ? [
          {
            credentialId: record.id,
            agentProfileId: record.agentProfileId,
            prefix: record.prefix,
            enrollmentCipher: record.runtimeEnrollmentCipher,
          },
        ]
      : [],
  );
  return {
    workerId,
    desiredFingerprint: rosterFingerprint(records),
    activeCredentialIds: records.map(({ id }) => id),
    entries,
  };
}

export function getRuntimeCredentialIdentity(
  _client: DatabaseExecutor,
  principal: RuntimePrincipal,
  workerId: string,
) {
  return Promise.resolve({
    workerId,
    credentialId: principal.credentialId,
    agentProfileId: principal.agentProfileId,
  });
}

export function acknowledgeRuntimeCredentialRoster(
  client: DatabaseExecutor,
  _principal: RuntimePrincipal,
  input: RuntimeCredentialRosterAckInput,
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await lockAgentSettings(transaction);
    const records = await listRuntimeCredentialRosterRecords(transaction, now);
    const desiredFingerprint = rosterFingerprint(records);
    if (input.desiredFingerprint !== desiredFingerprint)
      throw new AppError(
        "AGENT_RUNTIME_ROSTER_STALE",
        409,
        "Runtime credential roster değişti; worker güncel roster'ı yeniden yüklemelidir.",
      );
    const validIds = new Set(records.map(({ id }) => id));
    const expectedManagedIds = records
      .filter(({ runtimeEnrollmentCipher }) => runtimeEnrollmentCipher !== null)
      .map(({ id }) => id)
      .sort();
    const loadedIds = [...new Set(input.loadedCredentialIds)].sort();
    if (
      loadedIds.some((credentialId) => !validIds.has(credentialId)) ||
      expectedManagedIds.some((credentialId) => !loadedIds.includes(credentialId))
    )
      throw new AppError(
        "AGENT_RUNTIME_ROSTER_INCOMPLETE",
        409,
        "Worker bütün yönetilen runtime credential kayıtlarını yüklemedi.",
      );
    const sync = await upsertRuntimeCredentialSync(transaction, {
      workerId: input.workerId,
      desiredFingerprint,
      loadedCredentialIds: loadedIds,
      syncedAt: now,
    });
    return {
      workerId: sync.workerId,
      desiredFingerprint: sync.desiredFingerprint,
      loadedCredentialCount: sync.loadedCredentialIds.length,
      syncedAt: sync.syncedAt,
    };
  });
}
