import { randomUUID } from "node:crypto";
import type { DatabaseExecutor, InputJsonObject, TransactionClient } from "@/lib/db/types";
import { inTransaction } from "@/lib/db/transaction";
import { AppError } from "@/lib/http/errors";
import { sha256 } from "@/lib/security/crypto";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import { currentBirthParentEvidence } from "@/modules/agents/application/birth-evidence";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import { guardProductionRolloutRuntimeMutation } from "@/modules/agents/application/rollout-guard";
import {
  birthPolicyVersion,
  birthCandidateLifetimeMs,
  buildBirthPersona,
} from "@/modules/agents/domain/birth-policy";
import {
  birthScanDue,
  rotateBirthParents,
  birthParentPoolLimit,
  birthParentScanLimit,
} from "@/modules/agents/domain/birth-scheduling";
import { assertRuntimeCredential } from "@/modules/agents/domain/runtime-auth";
import { istanbulWeekWindow } from "@/modules/agents/domain/source-evolution";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";
import { rewardObject as object } from "@/modules/agents/domain/rewards";
import { globalAgentSettingsAggregateId } from "@/modules/agents/domain/settings-identity";
import { birthDraftBank } from "@/modules/agents/personas/birth-drafts";
import { lockAgentProfile, lockAgentSettings } from "@/modules/agents/repository/control-plane";
import * as records from "@/modules/agents/repository/birth-candidates";
import { canonicalLifeEventJson } from "@/modules/agents/repository/life-ledger";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { lockUserStates } from "@/modules/auth/repository/users";

type Candidate = NonNullable<Awaited<ReturnType<typeof records.findBirthCandidate>>>;
const conflict = () =>
  new AppError("AGENT_BIRTH_CONFLICT", 409, "Doğum adayı veya ayar sürümü değişti.");
const outcome = (code: string, candidateId: string | null = null) => ({
  outcome: code,
  candidateId,
});

async function audit(
  tx: TransactionClient,
  actor: ActorContext,
  action: string,
  candidateId: string | null,
  metadata: Record<string, unknown>,
) {
  await appendAuditLog(tx, {
    actorId: actor.actorId,
    requestId: actor.requestId,
    action,
    entityType: candidateId ? "AgentBirthCandidate" : "AgentGlobalSettings",
    entityId: candidateId ?? globalAgentSettingsAggregateId,
    metadata,
  });
}
async function close(
  tx: TransactionClient,
  actor: ActorContext,
  candidate: Candidate,
  status: "EXPIRED" | "WITHDRAWN" | "REJECTED",
  reason: string,
  now: Date,
) {
  const changed = await records.closeBirthCandidate(tx, {
    id: candidate.id,
    version: candidate.version,
    status,
    reason,
    now,
  });
  if (changed.count !== 1) throw conflict();
  await audit(tx, actor, "agent.birth.closed", candidate.id, {
    status,
    reason,
    policyVersion: candidate.policyVersion,
  });
}
async function universe(tx: TransactionClient) {
  return (await records.listBirthPersonaUniverse(tx)).flatMap((row) =>
    row.currentPersonaVersion ? [row.currentPersonaVersion.persona] : [],
  );
}

async function pendingInvalidReason(
  tx: TransactionClient,
  candidate: Candidate,
  now: Date,
): Promise<string | null> {
  if (candidate.expiresAt <= now) return "EXPIRED";
  if (candidate.policyVersion !== birthPolicyVersion) return "POLICY_CHANGED";
  const snapshot = object(candidate.evidence);
  if (
    sha256(canonicalLifeEventJson({ persona: candidate.persona, evidence: candidate.evidence })) !==
    candidate.snapshotHash
  )
    return "SNAPSHOT_INVALID";
  const ids = snapshot.assessmentIds;
  if (
    !Array.isArray(ids) ||
    ids.length !== 3 ||
    !ids.every((id): id is string => typeof id === "string")
  )
    return "EVIDENCE_INVALID";
  const current = await currentBirthParentEvidence(tx, candidate.parentProfileId, now, ids);
  if (!current) return "EVIDENCE_WITHDRAWN";
  if (current.parent.currentPersonaVersionId !== candidate.parentPersonaVersionId)
    return "PARENT_CHANGED";
  const name = object(candidate.persona).username;
  if (typeof name !== "string" || (await records.findUsedBirthDraftNames(tx, [name])).length)
    return "IDENTITY_USED";
  try {
    validatePersonaCandidate(
      candidate.persona,
      await universe(tx),
      "Bekleyen doğum adayının güncel ayrışma kontrolü.",
    );
  } catch (error) {
    if (error instanceof AppError && error.code.startsWith("PERSONA_")) return "DIVERSITY_CHANGED";
    throw error;
  }
  return null;
}

export async function runRuntimeBirthTick(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  input: { workerId: string },
  now = new Date(),
) {
  const settings = await records.getBirthSettings(client);
  if (!birthScanDue(settings, now))
    return outcome(settings.birthMode === "OFF" ? "OFF" : "NOT_DUE");
  return inTransaction(client, async (tx) => {
    // Pahalı ön seçimi de sıraya sokar: iki worker aynı günlük taramayı tekrarlamaz.
    // Yalnız bu yol scan kilidini alır; ardından user/profile/settings sırası korunur.
    await records.lockBirthScan(tx);
    return runLockedRuntimeBirthTick(tx, principal, input, now);
  });
}

async function runLockedRuntimeBirthTick(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  _input: { workerId: string },
  now = new Date(),
) {
  const initial = await records.getBirthSettings(client);
  if (!birthScanDue(initial, now)) return outcome(initial.birthMode === "OFF" ? "OFF" : "NOT_DUE");
  const pending = await records.findPendingBirth(client);
  let selectedParentId = pending?.parentProfileId ?? null;
  const cooldown =
    initial.lastBirthCandidateAt &&
    initial.lastBirthCandidateAt.getTime() + birthCandidateLifetimeMs > now.getTime();
  let parentPoolTruncated = false;
  if (!pending && !cooldown) {
    const parents = await records.listBirthParentIds(client);
    parentPoolTruncated = parents.length > birthParentPoolLimit;
    const dailyParents = rotateBirthParents(parents.slice(0, birthParentPoolLimit), now).slice(
      0,
      birthParentScanLimit,
    );
    for (const parent of dailyParents) {
      const eligible = await inTransaction(client, (tx) =>
        currentBirthParentEvidence(tx, parent.id, now),
      );
      if (eligible) {
        selectedParentId = parent.id;
        break;
      }
    }
  }
  const selectedParent = selectedParentId
    ? await records.findBirthParent(client, selectedParentId)
    : null;
  return inTransaction(client, async (tx) => {
    // Hesap durumları önce; profil advisory kilitleri kararlı sırada; global en son.
    await lockUserStates(
      tx,
      [principal.actor.actorId, ...(selectedParent ? [selectedParent.userId] : [])].map(
        (userId) => ({ userId, mode: "shared" as const }),
      ),
    );
    for (const id of [
      ...new Set([principal.agentProfileId, ...(selectedParentId ? [selectedParentId] : [])]),
    ].sort())
      await lockAgentProfile(tx, id);
    await lockAgentSettings(tx);
    const credential = await records.findBirthRuntimeCredential(tx, principal.credentialId);
    assertRuntimeCredential(credential, "runtime:plan", now);
    if (
      credential.agentProfileId !== principal.agentProfileId ||
      credential.agentProfile.user.id !== principal.actor.actorId ||
      principal.actor.actorKind !== "AGENT" ||
      principal.actor.actorRole !== "USER" ||
      principal.actor.origin !== "AGENT" ||
      !["DRAFT", "PAUSED", "ACTIVE"].includes(credential.agentProfile.lifecycleStatus)
    )
      throw new AppError("FORBIDDEN", 403, "Geçerli runtime planlayıcı gereklidir.");
    const rolloutBlock = await guardProductionRolloutRuntimeMutation(tx, principal.actor, now);
    if (rolloutBlock) return rolloutBlock;
    const settings = await records.getBirthSettings(tx);
    if (!birthScanDue(settings, now))
      return outcome(settings.birthMode === "OFF" ? "OFF" : "NOT_DUE");
    if (settings.settingsVersion !== initial.settingsVersion) return outcome("SETTINGS_CHANGED");
    const currentPending = await records.findPendingBirth(tx);
    if (currentPending && currentPending.id !== pending?.id)
      return outcome("PENDING_EXISTS", currentPending.id);
    await records.recordBirthScan(tx, now, false);
    const finish = async (code: string, candidateId: string | null = null) => {
      await audit(tx, principal.actor, "agent.birth.scan", candidateId, {
        outcome: code,
        policyVersion: birthPolicyVersion,
        ...(parentPoolTruncated
          ? { parentPoolTruncated: true, parentPoolLimit: birthParentPoolLimit }
          : {}),
      });
      return outcome(code, candidateId);
    };
    if (currentPending) {
      const invalid = await pendingInvalidReason(tx, currentPending, now);
      if (invalid) {
        await close(
          tx,
          principal.actor,
          currentPending,
          invalid === "EXPIRED" ? "EXPIRED" : "WITHDRAWN",
          invalid,
          now,
        );
        return finish(invalid, currentPending.id);
      }
      return finish("PENDING_EXISTS", currentPending.id);
    }
    if (
      settings.lastBirthCandidateAt &&
      settings.lastBirthCandidateAt.getTime() + birthCandidateLifetimeMs > now.getTime()
    )
      return finish("SEVEN_DAY_LIMIT");
    if (!selectedParentId) return finish("NO_ELIGIBLE_PARENT");
    const eligible = await currentBirthParentEvidence(tx, selectedParentId, now);
    if (!eligible) return finish("NO_ELIGIBLE_PARENT");
    const weekStart = istanbulWeekWindow(now).start;
    if (await records.findBirthInWeek(tx, selectedParentId, weekStart, birthPolicyVersion))
      return finish("WINDOW_ALREADY_USED");
    const [currentPersonas, usedNames, rejected] = await Promise.all([
      universe(tx),
      records.findUsedBirthDraftNames(
        tx,
        birthDraftBank.map((draft) => draft.persona.username),
      ),
      records.findRejectedBirthDrafts(tx),
    ]);
    for (const draft of birthDraftBank) {
      if (
        usedNames.some((name) => name.usernameNormalized === draft.persona.username) ||
        rejected.some(
          (row) => row.draftKey === draft.draftKey && row.draftVersion === draft.draftVersion,
        )
      )
        continue;
      const built = buildBirthPersona({
        draft: draft.persona,
        parent: eligible.persona,
        existingPersonas: currentPersonas,
      });
      if (!built) continue;
      const evidence: InputJsonObject = {
        policyVersion: birthPolicyVersion,
        parentProfileId: selectedParentId,
        parentPersonaVersionId: eligible.parent.currentPersonaVersionId!,
        draftKey: draft.draftKey,
        draftVersion: draft.draftVersion,
        assessmentIds: eligible.evidence.map((row) => row.id),
        origins: eligible.evidence.map((row) => ({
          sourceActKey: row.sourceActKey,
          sourceContentHash: row.sourceContentHash,
          sourceAt: row.sourceAt.toISOString(),
        })),
        inheritedInterestKey: built.inheritedInterestKey,
        inheritedCoreValueKey: built.inheritedCoreValueKey,
        validation: built.report,
      };
      const snapshotHash = sha256(canonicalLifeEventJson({ persona: built.persona, evidence }));
      const candidate = await records.createBirthCandidate(tx, {
        id: randomUUID(),
        parentProfileId: selectedParentId,
        parentPersonaVersionId: eligible.parent.currentPersonaVersionId!,
        draftKey: draft.draftKey,
        draftVersion: draft.draftVersion,
        policyVersion: birthPolicyVersion,
        weekStart,
        persona: built.persona,
        evidence,
        snapshotHash,
        createdAt: now,
        expiresAt: new Date(now.getTime() + birthCandidateLifetimeMs),
      });
      await records.recordBirthScan(tx, now, true);
      await audit(tx, principal.actor, "agent.birth.proposed", candidate.id, {
        policyVersion: birthPolicyVersion,
        parentProfileId: selectedParentId,
        snapshotHash,
      });
      return finish("PROPOSED", candidate.id);
    }
    return finish("NO_DRAFT_AVAILABLE");
  });
}

export function changeBirthMode(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: { mode: "OFF" | "CANDIDATES"; expectedSettingsVersion: number },
  now = new Date(),
) {
  return inTransaction(client, async (tx) => {
    await requireAgentAdminInTransaction(tx, actor);
    await lockAgentSettings(tx);
    const settings = await records.getBirthSettings(tx);
    if (settings.settingsVersion !== input.expectedSettingsVersion) throw conflict();
    if (input.mode === "OFF") {
      const pending = await records.findPendingBirth(tx);
      if (pending) await close(tx, actor, pending, "WITHDRAWN", "MODE_OFF", now);
    }
    const result = await records.setBirthMode(tx, actor.actorId, input.mode);
    await audit(tx, actor, "agent.birth.mode_changed", null, {
      from: settings.birthMode,
      to: input.mode,
      settingsVersion: result.settingsVersion,
    });
    return result;
  });
}

export async function inspectBirthCandidate(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: { candidateId?: string | undefined },
  now = new Date(),
) {
  return inTransaction(client, async (tx) => {
    await requireAgentAdminInTransaction(tx, actor);
    const first = input.candidateId
      ? await records.findBirthCandidate(tx, input.candidateId)
      : await records.findPendingBirth(tx);
    if (!first) {
      if (input.candidateId)
        throw new AppError("AGENT_BIRTH_NOT_FOUND", 404, "Doğum adayı bulunamadı.");
      return null;
    }
    await lockAgentProfile(tx, first.parentProfileId);
    await lockAgentSettings(tx);
    if (!input.candidateId && (await records.findPendingBirth(tx))?.id !== first.id)
      throw conflict();
    const candidate = await records.findBirthCandidate(tx, first.id);
    if (!candidate) throw conflict();
    if (candidate.status === "PROPOSED") {
      const settings = await records.getBirthSettings(tx);
      const invalid =
        settings.birthMode === "OFF" ? "MODE_OFF" : await pendingInvalidReason(tx, candidate, now);
      if (invalid)
        await close(
          tx,
          actor,
          candidate,
          invalid === "EXPIRED" ? "EXPIRED" : "WITHDRAWN",
          invalid,
          now,
        );
    }
    return records.findBirthCandidate(tx, first.id);
  });
}

export async function rejectBirthCandidate(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: { candidateId: string; expectedVersion: number },
  now = new Date(),
) {
  return inTransaction(client, async (tx) => {
    await requireAgentAdminInTransaction(tx, actor);
    const first = await records.findBirthCandidate(tx, input.candidateId);
    if (!first) throw new AppError("AGENT_BIRTH_NOT_FOUND", 404, "Doğum adayı bulunamadı.");
    await lockAgentProfile(tx, first.parentProfileId);
    await lockAgentSettings(tx);
    const candidate = await records.findBirthCandidate(tx, first.id);
    if (
      !candidate ||
      candidate.version !== input.expectedVersion ||
      candidate.status !== "PROPOSED"
    )
      throw conflict();
    await close(tx, actor, candidate, "REJECTED", "SEMANTIC_REJECTION", now);
    return outcome("REJECTED", candidate.id);
  });
}
