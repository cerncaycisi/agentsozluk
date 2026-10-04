import type { DatabaseExecutor } from "@/lib/db/types";
import { inTransaction } from "@/lib/db/transaction";
import { AppError } from "@/lib/http/errors";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import { pendingBirthInvalidReason } from "@/modules/agents/application/birth-candidates";
import { createAgent } from "@/modules/agents/application/control-plane";
import { assertProductionRolloutMutationAllowed } from "@/modules/agents/application/rollout-guard";
import {
  birthPreparationLifetimeMs,
  birthPreparationPopulationFailure,
  classifyIndependentBirthRoot,
} from "@/modules/agents/domain/birth-preparation";
import {
  runtimeAgentSourceLimit,
  runtimeSourceHolderLimit,
} from "@/modules/agents/domain/runtime-source-candidates";
import { agentPersonaTemplates } from "@/modules/agents/personas/templates";
import * as candidates from "@/modules/agents/repository/birth-candidates";
import * as records from "@/modules/agents/repository/birth-preparation";
import {
  lockAgentProfile,
  lockAgentSettings,
  lockAgentSourceCapacity,
} from "@/modules/agents/repository/control-plane";
import { lockPersonaUniverse } from "@/modules/agents/repository/persona-lock";
import {
  countRuntimeAgentSources,
  countRuntimeSourceHolders,
} from "@/modules/agents/repository/runtime";
import { createAgentSchema } from "@/modules/agents/validation/schemas";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { lockUserStates } from "@/modules/auth/repository/users";
import { canonicalRequestHash } from "@/modules/idempotency/domain/idempotency";

const independentTemplateHashes = new Set(agentPersonaTemplates.map(canonicalRequestHash));
const blocked = (reason: string) =>
  new AppError(
    "AGENT_BIRTH_PREPARATION_BLOCKED",
    409,
    "Doğum hazırlığı koşulları sağlanmıyor.",
    undefined,
    undefined,
    { reason },
  );

export async function prepareBirthCandidate(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: {
    candidateId: string;
    expectedVersion: number;
    expectedSnapshotHash: string;
    expectedSettingsVersion: number;
  },
  now = new Date(),
) {
  return inTransaction(client, async (tx) => {
    // Ön okuma yalnız kilit kimliğini seçer; yetki ve bütün kararlar kilit altında yeniden okunur.
    const first = await candidates.findBirthCandidate(tx, input.candidateId);
    const parent = first ? await candidates.findBirthParent(tx, first.parentProfileId) : null;
    await lockUserStates(
      tx,
      [...new Set([actor.actorId, ...(parent ? [parent.userId] : [])])].map((userId) => ({
        userId,
        mode: "shared" as const,
      })),
    );
    await requireAgentAdminInTransaction(tx, actor);
    if (!first || !parent)
      throw new AppError("AGENT_BIRTH_NOT_FOUND", 404, "Doğum adayı bulunamadı.");
    await lockAgentProfile(tx, first.parentProfileId);
    await lockAgentSettings(tx);
    await lockAgentSourceCapacity(tx);
    await lockPersonaUniverse(tx);
    const candidate = await candidates.findBirthCandidate(tx, first.id);
    const settings = await candidates.getBirthSettings(tx);
    if (
      !candidate ||
      candidate.status !== "PROPOSED" ||
      candidate.version !== input.expectedVersion ||
      candidate.snapshotHash !== input.expectedSnapshotHash ||
      settings.settingsVersion !== input.expectedSettingsVersion
    )
      throw blocked("STALE_PREVIEW");
    if (settings.birthMode !== "CANDIDATES") throw blocked("MODE_OFF");
    await assertProductionRolloutMutationAllowed(tx, now);
    const invalid = await pendingBirthInvalidReason(tx, candidate, now);
    if (invalid) throw blocked(invalid);
    const rootEvidence = await records.loadBirthRootEvidence(tx, candidate.parentProfileId);
    const root = rootEvidence
      ? classifyIndependentBirthRoot(rootEvidence, independentTemplateHashes)
      : null;
    // İlk pilotta yalnız kanıtlı bağımsız kök ebeveyn olabilir. UNKNOWN, CUSTOM etiketiyle aklanmaz.
    if (!root) throw blocked("ROOT_UNKNOWN");
    const population = await records.birthPreparationPopulation(tx, root.rootProfileId);
    const populationFailure = birthPreparationPopulationFailure(population);
    if (populationFailure) throw blocked(populationFailure);

    const creation = createAgentSchema.parse({
      persona: candidate.persona,
      lifecycleStatus: "PAUSED",
    });
    const created = await createAgent(tx, actor, creation);
    if (!created.runtimeEnrollmentManaged) throw blocked("MANAGED_ENROLLMENT_REQUIRED");
    const childProfileId = created.agent.profile.id;
    // createAgent kanonik paketler için kapasite istisnası taşır; doğum yolunda istisna yoktur.
    if ((await countRuntimeAgentSources(tx, childProfileId)) > runtimeAgentSourceLimit)
      throw blocked("SOURCE_STOCK_LIMIT");
    for (const source of creation.persona.sources)
      if ((await countRuntimeSourceHolders(tx, source.url)) > runtimeSourceHolderLimit)
        throw blocked("SOURCE_HOLDER_LIMIT");

    const preparationExpiresAt = new Date(now.getTime() + birthPreparationLifetimeMs);
    const preparationEvidence = {
      policyVersion: 1,
      root,
      candidateSnapshotHash: candidate.snapshotHash,
      candidatePolicyVersion: candidate.policyVersion,
      parentPersonaVersionId: candidate.parentPersonaVersionId,
      populationBefore: population,
      sourceCount: creation.persona.sources.length,
      managedEnrollment: true,
    };
    const changed = await records.recordBirthPreparation(tx, {
      candidateId: candidate.id,
      expectedVersion: candidate.version,
      childProfileId,
      rootProfileId: root.rootProfileId,
      preparedAt: now,
      preparationExpiresAt,
      preparationEvidence,
    });
    if (changed.count !== 1) throw blocked("STALE_PREVIEW");
    await appendAuditLog(tx, {
      actorId: actor.actorId,
      requestId: actor.requestId,
      action: "agent.birth.prepared",
      entityType: "AgentBirthCandidate",
      entityId: candidate.id,
      metadata: {
        childProfileId,
        preparationExpiresAt: preparationExpiresAt.toISOString(),
        ...preparationEvidence,
      },
    });
    // createAgent'in tek gösterimlik credential'ı ve tüm user/profile alanları bilerek dışarı taşınmaz.
    return {
      candidateId: candidate.id,
      candidateVersion: candidate.version + 1,
      childProfileId,
      status: "PREPARED" as const,
      preparationExpiresAt: preparationExpiresAt.toISOString(),
    };
  });
}
