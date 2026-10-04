import { getEnvironment } from "@/config/env";
import type { DatabaseExecutor } from "@/lib/db/types";
import { inTransaction } from "@/lib/db/transaction";
import { AppError } from "@/lib/http/errors";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import { currentBirthParentEvidence } from "@/modules/agents/application/birth-evidence";
import { changeAgentLifecycle } from "@/modules/agents/application/control-plane";
import { assertProductionRolloutMutationAllowed } from "@/modules/agents/application/rollout-guard";
import { assertManagedRuntimeCredentialReady } from "@/modules/agents/application/runtime-readiness";
import {
  birthAcceptanceConfigurationHash,
  birthAcceptanceReportFailure,
  evaluateBirthLineageActivation,
  evaluateBirthSourceCoverage,
} from "@/modules/agents/domain/birth-activation";
import { birthPolicyVersion } from "@/modules/agents/domain/birth-policy";
import {
  birthPreparationIsOpen,
  classifyIndependentBirthRoot,
} from "@/modules/agents/domain/birth-preparation";
import {
  capabilityFreshness,
  calculateRuntimeCapacity,
  runtimeFingerprint,
} from "@/modules/agents/domain/capacity";
import {
  circuitBreakerConfigSchema,
  evaluateCircuitBreakers,
} from "@/modules/agents/domain/circuit-breaker";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";
import { rewardObject as object } from "@/modules/agents/domain/rewards";
import {
  runtimeAgentSourceLimit,
  runtimeSourceHolderLimit,
} from "@/modules/agents/domain/runtime-source-candidates";
import { agentPersonaTemplates } from "@/modules/agents/personas/templates";
import * as candidates from "@/modules/agents/repository/birth-candidates";
import * as preparation from "@/modules/agents/repository/birth-preparation";
import * as records from "@/modules/agents/repository/birth-activation";
import {
  getGlobalSettingsRecord,
  lockAgentProfile,
  lockAgentSettings,
  lockAgentSourceCapacity,
} from "@/modules/agents/repository/control-plane";
import {
  getLatestRuntimeCapability,
  getLatestRuntimeFingerprintRecord,
  getRuntimeOperationalMetrics,
} from "@/modules/agents/repository/capacity";
import { lockPersonaUniverse } from "@/modules/agents/repository/persona-lock";
import {
  countRuntimeAgentSources,
  countRuntimeSourceHoldersForUrls,
} from "@/modules/agents/repository/runtime";
import {
  activateBirthCandidateSchema,
  type ActivateBirthCandidateInput,
} from "@/modules/agents/validation/birth-schemas";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { lockUserStates } from "@/modules/auth/repository/users";
import { canonicalRequestHash } from "@/modules/idempotency/domain/idempotency";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";

const independentTemplateHashes = new Set(agentPersonaTemplates.map(canonicalRequestHash));
const blocked = (reason: string, evidence?: Record<string, unknown>) =>
  new AppError(
    "AGENT_BIRTH_ACTIVATION_BLOCKED",
    409,
    "Doğum aktivasyonu koşulları sağlanmıyor.",
    undefined,
    undefined,
    { reason, ...evidence },
  );

export async function activateBirthCandidate(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: ActivateBirthCandidateInput,
  now = new Date(),
) {
  const parsed = activateBirthCandidateSchema.parse(input);
  return inTransaction(client, async (tx) => {
    const first = await candidates.findBirthCandidate(tx, parsed.candidateId);
    const parentFirst = first ? await candidates.findBirthParent(tx, first.parentProfileId) : null;
    const childFirst = first?.childProfileId
      ? await candidates.findBirthParent(tx, first.childProfileId)
      : null;
    await lockUserStates(
      tx,
      [
        ...new Set([
          actor.actorId,
          ...[parentFirst, childFirst].flatMap((row) => (row ? [row.userId] : [])),
        ]),
      ].map((userId) => ({ userId, mode: "shared" as const })),
    );
    await requireAgentAdminInTransaction(tx, actor);
    if (!first || !parentFirst || !childFirst) throw blocked("PREPARATION_REQUIRED");
    for (const id of [parentFirst.id, childFirst.id].sort()) await lockAgentProfile(tx, id);
    await lockAgentSettings(tx);
    await lockAgentSourceCapacity(tx);
    await lockPersonaUniverse(tx);
    const candidate = await candidates.findBirthCandidate(tx, first.id);
    const settings = await getGlobalSettingsRecord(tx);
    if (
      !candidate ||
      candidate.version !== parsed.expectedVersion ||
      candidate.snapshotHash !== parsed.expectedSnapshotHash ||
      settings.settingsVersion !== parsed.expectedSettingsVersion
    )
      throw blocked("STALE_PREVIEW");
    if (
      !birthPreparationIsOpen(candidate, now) ||
      candidate.childProfileId !== childFirst.id ||
      candidate.rootProfileId !== candidate.parentProfileId
    )
      throw blocked("PREPARATION_CLOSED");
    if (candidate.policyVersion !== birthPolicyVersion) throw blocked("POLICY_CHANGED");
    if (settings.birthMode !== "CANDIDATES") throw blocked("MODE_OFF");
    if (
      !settings.runtimeEnabled ||
      !settings.schedulerEnabled ||
      !settings.publishEnabled ||
      !settings.publicWriteEnabled ||
      !settings.sourceReadingEnabled ||
      settings.runtimeOperatingMode !== "NORMAL" ||
      settings.degradedMode
    )
      throw blocked("RUNTIME_PAUSED");
    await assertProductionRolloutMutationAllowed(tx, now);
    const child = await candidates.findBirthParent(tx, childFirst.id);
    if (
      !child ||
      child.lifecycleStatus !== "PAUSED" ||
      child.user.status !== "ACTIVE" ||
      child.user.kind !== "AGENT" ||
      child.user.role !== "USER" ||
      !child.user.loginDisabled ||
      !child.currentPersonaVersion
    )
      throw blocked("CHILD_NOT_READY");
    if (
      canonicalRequestHash({ persona: candidate.persona, evidence: candidate.evidence }) !==
      candidate.snapshotHash
    )
      throw blocked("SNAPSHOT_INVALID");
    const pinned = object(candidate.preparationEvidence);
    const pinnedRoot = object(pinned.root);
    const catalogHash = canonicalRequestHash([...independentTemplateHashes].sort());
    if (pinnedRoot.templateCatalogHash !== catalogHash) throw blocked("TEMPLATE_CATALOG_CHANGED");
    const evidence = await preparation.loadBirthRootEvidence(tx, candidate.parentProfileId);
    const root = evidence
      ? classifyIndependentBirthRoot(evidence, independentTemplateHashes)
      : null;
    if (
      !root ||
      canonicalRequestHash(root) !== canonicalRequestHash(pinnedRoot) ||
      pinned.candidateSnapshotHash !== candidate.snapshotHash
    )
      throw blocked("LINEAGE_EVIDENCE_LOST");
    // Hazırlığın eski üç kanıtını yenisi diye sunma: güncel, gerekirse farklı üçlü seçilir.
    const parent = await currentBirthParentEvidence(tx, candidate.parentProfileId, now);
    if (!parent) throw blocked("CURRENT_PARENT_QUALITY_REQUIRED");
    try {
      validatePersonaCandidate(
        child.currentPersonaVersion.persona,
        (await records.listBirthActivationPersonas(tx, child.id)).flatMap((row) =>
          row.currentPersonaVersion ? [row.currentPersonaVersion.persona] : [],
        ),
        "Doğum aktivasyonunun güncel ayrışma kontrolü.",
      );
    } catch (error) {
      if (error instanceof AppError && error.code.startsWith("PERSONA_"))
        throw blocked("DIVERSITY_CHANGED");
      throw error;
    }
    const population = await preparation.birthPreparationPopulation(tx, root.rootProfileId);
    const histories = await records.loadBirthActivationHistories(tx, independentTemplateHashes);
    if (histories.truncated) throw blocked("ACTIVATION_HISTORY_TRUNCATED");
    if (histories.unresolvedClone) throw blocked("LEGACY_CLONE_LINEAGE_UNKNOWN");
    const lineage = evaluateBirthLineageActivation({
      now,
      childProfileId: child.id,
      rootProfileId: root.rootProfileId,
      ...population,
      profiles: histories.profiles,
    });
    if (lineage.failures[0]) throw blocked(lineage.failures[0]);
    const activeProfileIds = histories.profiles
      .filter((row) => row.history.currentStatus === "ACTIVE")
      .map((row) => row.profileId);
    const report = parsed.acceptanceReport;
    const reportFailure = birthAcceptanceReportFailure({
      report,
      reportHash: parsed.acceptanceReportHash,
      deploymentSha: getEnvironment().AGENT_SOURCE_REVISION,
      configurationHash: birthAcceptanceConfigurationHash(settings),
      promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
      activeProfileIds,
      now,
    });
    if (reportFailure) throw blocked(reportFailure);
    const from = new Date(report.windowFrom);
    // Toplum raporuyla aynı yarı açık aralık: [from, to). Tam to anındaki pause pencere dışında.
    const to = new Date(report.windowTo);
    const baselineCapability = await records.findBirthAcceptanceCapability(
      tx,
      report.baselineCapabilityId,
    );
    if (
      !baselineCapability ||
      baselineCapability.measuredAt > from ||
      baselineCapability.staleAt <= from ||
      baselineCapability.capacityStatus !== "HEALTHY" ||
      baselineCapability.benchmarkRunCount < 10 ||
      baselineCapability.promptProfileHash !== RUNTIME_PROMPT_PROFILE_HASH
    )
      throw blocked("ACCEPTANCE_BENCHMARK_MISMATCH");
    for (const row of histories.profiles.filter((item) =>
      activeProfileIds.includes(item.profileId),
    )) {
      let status = row.history.initialStatus;
      if (row.history.createdAt > from) throw blocked("ACCEPTANCE_COHORT_NOT_CONTINUOUS");
      for (const transition of row.history.transitions) {
        if (transition.occurredAt <= from) status = transition.to;
        else if (transition.occurredAt < to && transition.to !== "ACTIVE")
          throw blocked("ACCEPTANCE_COHORT_NOT_CONTINUOUS");
      }
      if (status !== "ACTIVE") throw blocked("ACCEPTANCE_COHORT_NOT_CONTINUOUS");
    }
    const runEvidence = await records.loadBirthCohortRunEvidence(tx, {
      profileIds: activeProfileIds,
      from,
      to,
    });
    if (runEvidence.length !== activeProfileIds.length)
      throw blocked("ACCEPTANCE_RUN_EVIDENCE_MISSING");
    const sourceRows = await records.loadBirthActivationSources(tx, now);
    if (sourceRows.truncated) throw blocked("SOURCE_INVENTORY_TRUNCATED");
    const sourceCoverage = evaluateBirthSourceCoverage(sourceRows.sources, child.id, now);
    if (sourceCoverage.failures[0])
      throw blocked(
        sourceCoverage.failures[0],
        sourceCoverage.failures[0] === "SOURCE_METADATA_INVALID"
          ? { invalidTopicPayloads: sourceCoverage.invalidTopicPayloads }
          : undefined,
      );
    if ((await countRuntimeAgentSources(tx, child.id)) > runtimeAgentSourceLimit)
      throw blocked("SOURCE_STOCK_LIMIT");
    const holders = await countRuntimeSourceHoldersForUrls(
      tx,
      sourceRows.sources.filter((row) => row.username === child.id).map((row) => row.url),
    );
    if ([...holders.values()].some((count) => count > runtimeSourceHolderLimit))
      throw blocked("SOURCE_HOLDER_LIMIT");
    const readiness = await assertManagedRuntimeCredentialReady(tx, child.id, now);
    if (!readiness.managed) throw blocked("MANAGED_ENROLLMENT_REQUIRED");
    const capability = await getLatestRuntimeCapability(tx);
    const fingerprint = runtimeFingerprint(
      (await getLatestRuntimeFingerprintRecord(tx))?.usageMetadata,
    );
    if (
      !capability ||
      capability.capacityStatus !== "HEALTHY" ||
      capability.benchmarkRunCount < 10 ||
      capability.measuredAt > now ||
      !fingerprint.codexVersion ||
      fingerprint.promptProfileHash !== RUNTIME_PROMPT_PROFILE_HASH ||
      !capabilityFreshness(capability, {
        now,
        ...fingerprint,
        promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
      }).fresh
    )
      throw blocked("CAPACITY_NOT_READY");
    const capacity = calculateRuntimeCapacity({
      capability,
      configuredConcurrency: settings.codexConcurrency === 2 ? 2 : 1,
      degradedMode: settings.degradedMode,
      now,
      ...fingerprint,
      promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
    });
    if (capacity.effectiveConcurrency !== settings.codexConcurrency)
      throw blocked("CAPACITY_NOT_READY");
    const config = circuitBreakerConfigSchema.parse(settings.circuitBreakerConfig);
    const operational = await getRuntimeOperationalMetrics(tx, {
      now,
      concurrency: capacity.effectiveConcurrency === 2 ? 2 : 1,
      config,
    });
    const breakers = evaluateCircuitBreakers(config, operational);
    if (breakers.activeCriticalCodes.length || breakers.capacityAtRisk)
      throw blocked("CAPACITY_BREAKER_ACTIVE");
    const changed = await records.recordBirthActivation(tx, {
      candidateId: candidate.id,
      expectedVersion: candidate.version,
      now,
    });
    if (changed.count !== 1) throw blocked("STALE_PREVIEW");
    // Geçici ACTIVATED başka transaction'a görünmez. Lifecycle/audit hatası bütün geçişi geri alır.
    await changeAgentLifecycle(
      tx,
      actor,
      child.id,
      {
        status: "ACTIVE",
        reason: "Bağımsız doğum pilotunun kaynak, soy ve kabul koşulları doğrulandı.",
      },
      now,
    );
    await appendAuditLog(tx, {
      actorId: actor.actorId,
      requestId: actor.requestId,
      action: "agent.birth.activated",
      entityType: "AgentBirthCandidate",
      entityId: candidate.id,
      metadata: {
        policyVersion: birthPolicyVersion,
        childProfileId: child.id,
        root,
        activatedAt: now.toISOString(),
        parentPersonaVersionId: parent.parent.currentPersonaVersionId,
        parentQualityEvidence: parent.evidence,
        childPersonaVersionId: child.currentPersonaVersionId,
        population,
        recentFirstActivations: lineage.recentFirstActivations,
        sourceCoverage: {
          ...sourceCoverage,
          window: {
            from: sourceCoverage.window.from.toISOString(),
            to: sourceCoverage.window.to.toISOString(),
          },
        },
        capabilityId: capability.id,
        acceptance: {
          kind: "OPERATOR_VERIFIED_REPORT",
          report,
          reportHash: parsed.acceptanceReportHash,
          operatorAsserted: [
            "M2_ACCEPTANCE",
            "INDEPENDENT_REVIEW",
            "UNCHANGED_DEPLOYMENT",
            "UNCHANGED_CONFIGURATION",
            "ARTIFACT_HASHES",
          ],
          dbVerified: [
            "COHORT_CONTINUITY",
            "NATURAL_RUN_PRESENCE",
            "BENCHMARK_BEFORE_WINDOW",
            "CURRENT_SOURCE_COVERAGE",
            "LINEAGE_AND_POPULATION",
            "CURRENT_QUALITY",
            "CURRENT_RUNTIME_READINESS",
          ],
          serverVerified: [
            "CURRENT_DEPLOYMENT_SHA",
            "CURRENT_CONFIGURATION_HASH",
            "PROMPT_PROFILE_HASH",
            "WINDOW_DURATION_AND_FRESHNESS",
            "STRUCTURED_REPORT_HASH",
          ],
        },
      },
    });
    return {
      candidateId: candidate.id,
      candidateVersion: candidate.version + 1,
      childProfileId: child.id,
      status: "ACTIVATED" as const,
      activatedAt: now.toISOString(),
    };
  });
}
