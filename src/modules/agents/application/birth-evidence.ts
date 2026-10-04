import type { TransactionClient } from "@/lib/db/types";
import { sha256 } from "@/lib/security/crypto";
import {
  selectBirthParentEvidence,
  type BirthAssessmentEvidence,
} from "@/modules/agents/domain/birth-policy";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";
import {
  assessmentContentHash,
  assessmentEntryVisibilityHash,
  rewardObject as object,
} from "@/modules/agents/domain/rewards";
import { canonicalLifeEventJson } from "@/modules/agents/repository/life-ledger";
import * as records from "@/modules/agents/repository/birth-candidates";
import { findAssessmentEntries } from "@/modules/agents/repository/rewards";
import { assessmentVisibilityChecksSchema } from "@/modules/agents/validation/reward-schemas";

export async function currentBirthParentEvidence(
  tx: TransactionClient,
  profileId: string,
  now: Date,
  pinnedAssessmentIds?: string[],
) {
  const parent = await records.findBirthParent(tx, profileId);
  const active =
    parent?.lifecycleStatus === "ACTIVE" &&
    parent.user.status === "ACTIVE" &&
    parent.user.kind === "AGENT" &&
    parent.user.role === "USER" &&
    parent.user.loginDisabled &&
    parent.currentPersonaVersion !== null;
  if (!active || !parent?.currentPersonaVersion) return null;
  // Bozuk güncel persona görünmezce uygun sayılmaz; pairwise kapı çocuğa uygulanır.
  const validatedParent = validatePersonaCandidate(
    parent.currentPersonaVersion.persona,
    [],
    "Doğum ebeveyni güncel persona kontrolü.",
  );
  const history = await records.findBirthAssessmentHistory(tx, profileId, now);
  const checksById = new Map(
    history.assessments.flatMap((row) => {
      const parsed = assessmentVisibilityChecksSchema.safeParse(
        object(row.evidenceSnapshot).visibilityChecks,
      );
      return parsed.success && parsed.data.every((check) => check.kind === "ENTRY")
        ? [[row.id, parsed.data] as const]
        : [];
    }),
  );
  const entryIds = [...new Set([...checksById.values()].flat().map((check) => check.id))];
  const entries = entryIds.length ? await findAssessmentEntries(tx, entryIds) : [];
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const entryHashes = new Map(
    entries.map((entry) => [entry.id, assessmentEntryVisibilityHash(entry)]),
  );
  const facts: BirthAssessmentEvidence[] = history.assessments.map((row) => {
    const snapshot = object(row.evidenceSnapshot);
    const packet = object(snapshot.packet);
    const checks = checksById.get(row.id);
    const target = row.entryId ? entriesById.get(row.entryId) : undefined;
    const packageHash = checks
      ? sha256(
          canonicalLifeEventJson({
            packet: snapshot.packet,
            entryId: row.entryId,
            sourceActKey: row.sourceActKey,
            sourceAt: row.sourceAt.toISOString(),
            visibilityChecks: checks,
          }),
        )
      : null;
    const attested = history.audits.some((audit) => {
      const metadata = object(audit.metadata);
      return (
        audit.entityId === row.id &&
        audit.actorId === row.createdById &&
        metadata.independentReviewConfirmed === true &&
        metadata.policyVersion === 2 &&
        metadata.channel === "QUALITY" &&
        metadata.mode === row.mode &&
        metadata.verdict === row.verdict &&
        metadata.packageHash === row.packageHash
      );
    });
    return {
      id: row.id,
      agentProfileId: profileId,
      sourceActKey: row.sourceActKey,
      sourceContentHash: row.sourceContentHash,
      sourceAt: row.sourceAt,
      assessedAt: row.createdAt,
      topicId: target?.topicId ?? "",
      channel: row.channel,
      mode: row.mode,
      verdict: row.verdict,
      policyVersion: typeof packet.policyVersion === "number" ? packet.policyVersion : 0,
      independentReviewConfirmed:
        attested && packet.channel === "QUALITY" && packageHash === row.packageHash,
      reversed: history.reversedOrigins.has(row.sourceActKey),
      currentlyVisibleAndUnchanged: Boolean(
        target &&
        target.authorId === parent.userId &&
        checks &&
        checks.some((check) => check.id === row.entryId) &&
        checks.every((check) => entryHashes.get(check.id) === check.contentHash) &&
        assessmentContentHash(target.body) === row.sourceContentHash,
      ),
    };
  });
  // Adayın sabit üç kanıtını yeni bir üçlüyle değiştirme; son kararın ID'si de aynı olmalı.
  const selectedFacts = pinnedAssessmentIds
    ? facts.filter((row) => pinnedAssessmentIds.includes(row.id))
    : facts;
  const result = selectBirthParentEvidence({
    agentProfileId: profileId,
    active: true,
    assessments: selectedFacts,
    now,
  });
  if (!result.eligible) return null;
  return { parent, persona: validatedParent.persona, evidence: result.evidence };
}
