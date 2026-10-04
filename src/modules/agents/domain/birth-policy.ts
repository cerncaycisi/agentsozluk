import { istanbulWeekWindow } from "@/modules/agents/domain/source-evolution";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";
import { seedPersonaSchema, type SeedPersona } from "@/modules/agents/personas/schema";
import { AppError } from "@/lib/http/errors";

export const birthPolicyVersion = 1;
export const birthEvidencePolicyVersion = 2;
export const birthEvidenceLifetimeMs = 14 * 24 * 60 * 60 * 1000;
export const birthCandidateLifetimeMs = 7 * 24 * 60 * 60 * 1000;
export const birthEvidenceOriginLimit = 32;
export const birthMinimumEvidenceSpanMs = 48 * 60 * 60 * 1000;

// Yalnız sunucunun DB/audit ve güncel görünürlük kontrollerinden türetilen girdiler.
// HTTP payload'ından gelen bir boolean bağımsız değerlendirme kanıtı değildir.
export interface BirthAssessmentEvidence {
  id: string;
  agentProfileId: string;
  sourceActKey: string;
  sourceContentHash: string;
  topicId: string;
  sourceAt: Date;
  assessedAt: Date;
  channel: "QUALITY" | "INTRINSIC";
  mode: "OFF" | "SHADOW" | "FULFILL_SLOT";
  verdict: string;
  policyVersion: number;
  independentReviewConfirmed: boolean;
  currentlyVisibleAndUnchanged: boolean;
  reversed: boolean;
}

export type BirthParentEvidenceResult =
  | { eligible: false; reason: "PARENT_INACTIVE" | "INSUFFICIENT_EVIDENCE" }
  | {
      eligible: true;
      evidence: [BirthAssessmentEvidence, BirthAssessmentEvidence, BirthAssessmentEvidence];
    };

/** Geçmişteki son kayıt, olumsuz olsa da eski olumlu kaydı gölgeler.
 * Çağıran seçtiği kökenlerin TÜM sonraki kararlarını ve reversal geçmişini sağlamalıdır.
 * expired authorFeedback TTL bu ayrı 14 günlük ebeveyn kanıtını belirlemez.
 */
export function selectBirthParentEvidence(input: {
  agentProfileId: string;
  active: boolean;
  assessments: readonly BirthAssessmentEvidence[];
  now: Date;
}): BirthParentEvidenceResult {
  if (!input.active) return { eligible: false, reason: "PARENT_INACTIVE" };
  const profileHistory = input.assessments.filter(
    (row) => row.agentProfileId === input.agentProfileId,
  );
  const history = profileHistory
    .filter((row) => row.channel === "QUALITY")
    .sort((a, b) => b.assessedAt.getTime() - a.assessedAt.getTime() || b.id.localeCompare(a.id));
  // Geri alınan köken yeniden etiketlenerek uygun hale gelemez; yeni yayın kanıtı gerekir.
  const revokedOrigins = new Set(
    profileHistory.filter((row) => row.reversed).map((row) => row.sourceActKey),
  );
  const seenOrigins = new Set<string>();
  const candidates: BirthAssessmentEvidence[] = [];
  for (const row of history) {
    if (seenOrigins.has(row.sourceActKey)) continue;
    if (seenOrigins.size >= birthEvidenceOriginLimit) break;
    seenOrigins.add(row.sourceActKey);
    if (
      row.channel !== "QUALITY" ||
      row.assessedAt > input.now ||
      row.mode === "OFF" ||
      row.verdict !== "SUPPORTED" ||
      revokedOrigins.has(row.sourceActKey) ||
      row.policyVersion !== birthEvidencePolicyVersion ||
      !row.independentReviewConfirmed ||
      !row.currentlyVisibleAndUnchanged ||
      row.sourceAt > row.assessedAt ||
      row.sourceAt > input.now ||
      row.sourceAt.getTime() <= input.now.getTime() - birthEvidenceLifetimeMs ||
      !row.topicId ||
      !row.sourceActKey ||
      !/^[a-f0-9]{64}$/u.test(row.sourceContentHash)
    )
      continue;
    candidates.push(row);
  }
  // Üçlü arama, aynı içeriğin en yeni kopyasının uygun bir eski zamanı gölgelemesini önler.
  // Repository aday kökenlerini sınırlamalı; bu işlev geçmişi kesip eski olumluya düşmez.
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      for (let k = j + 1; k < candidates.length; k += 1) {
        const evidence: [
          BirthAssessmentEvidence,
          BirthAssessmentEvidence,
          BirthAssessmentEvidence,
        ] = [candidates[i]!, candidates[j]!, candidates[k]!];
        const times = evidence.map((row) => row.sourceAt.getTime());
        if (
          new Set(evidence.map((row) => row.sourceContentHash)).size === 3 &&
          new Set(evidence.map((row) => row.topicId)).size >= 2 &&
          new Set(evidence.map((row) => istanbulWeekWindow(row.sourceAt).start.getTime())).size >=
            2 &&
          Math.max(...times) - Math.min(...times) >= birthMinimumEvidenceSpanMs
        )
          return { eligible: true, evidence };
      }
    }
  }
  return { eligible: false, reason: "INSUFFICIENT_EVIDENCE" };
}

const normalizedKey = (key: string) =>
  key.normalize("NFKC").toLocaleLowerCase("tr-TR").trim().replaceAll(/\s+/gu, " ");

function inheritOneKey(
  draft: SeedPersona["interests"],
  parent: SeedPersona["interests"],
): { values: SeedPersona["interests"]; inheritedKey: string } | null {
  const keys = new Set(draft.map(({ key }) => normalizedKey(key)));
  if (
    keys.size !== draft.length ||
    new Set(parent.map(({ key }) => normalizedKey(key))).size !== parent.length
  )
    return null;
  const donor = parent
    .filter(({ key, weight }) => weight > 0 && !keys.has(normalizedKey(key)))
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key, "tr"))[0];
  if (!donor) return null;
  // Taslağın en düşük ağırlıklı açık alanı değişir; ağırlık ebeveynden taşınmaz.
  const slots = draft.map((value, index) => ({ ...value, index })).filter((value) => !value.pinned);
  const slot = slots.sort((a, b) => a.weight - b.weight || a.index - b.index)[0]?.index;
  if (slot === undefined) return null;
  return {
    values: draft.map((value, index) => ({
      ...value,
      key: index === slot ? donor.key : value.key,
      pinned: index === slot ? false : value.pinned,
    })),
    inheritedKey: donor.key,
  };
}

export function buildBirthPersona(input: {
  draft: unknown;
  parent: unknown;
  existingPersonas: readonly unknown[];
}) {
  const draft = seedPersonaSchema.parse(input.draft);
  const parent = seedPersonaSchema.parse(input.parent);
  // Bütün geçmiş parse edilir; erken kimlik/anahtar reddi bozuk veriyi gizleyemez.
  const universe = [...input.existingPersonas, parent].map((value) =>
    seedPersonaSchema.parse(value),
  );
  const interests = inheritOneKey(draft.interests, parent.interests);
  const coreValues = inheritOneKey(draft.coreValues, parent.coreValues);
  if (!interests || !coreValues) return null;
  const candidate = {
    ...draft,
    interests: interests.values,
    coreValues: coreValues.values,
    sources: draft.sources.map((source) => ({ ...source, status: "SEED" as const, pinned: false })),
  };
  // Parent'ın bu listeye yanlışlıkla alınmaması ayrışma kapısını gevşetmesin.
  if (universe.some((value) => value.username === candidate.username)) return null;
  try {
    const validated = validatePersonaCandidate(
      candidate,
      universe,
      "Bağımsız doğum adayı taslağı.",
    );
    return {
      ...validated,
      inheritedInterestKey: interests.inheritedKey,
      inheritedCoreValueKey: coreValues.inheritedKey,
    };
  } catch (error) {
    // Başka hata veya bozuk geçmiş veri sessizce taslak yetersizliğine dönüşmez.
    if (
      error instanceof AppError &&
      [
        "PERSONA_PAIRWISE_DISTANCE_REJECTED",
        "PERSONA_ONTOLOGY_REJECTED",
        "PERSONA_BASELINE_DISTANCE_REJECTED",
      ].includes(error.code)
    )
      return null;
    throw error;
  }
}
