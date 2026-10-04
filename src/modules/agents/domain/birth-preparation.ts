import { canonicalRequestHash } from "@/modules/idempotency/domain/idempotency";

export const birthPreparationLifetimeMs = 14 * 24 * 60 * 60 * 1000;
export const birthPopulationLimit = 40;
export const birthRootLivingLimit = 2;
export const birthSourcePreparationTrigger = "ADMIN_BIRTH_SOURCE";

export function birthPreparationIsOpen(
  candidate: { status: string; preparedAt: Date | null; preparationExpiresAt: Date | null } | null,
  now: Date,
): boolean {
  return Boolean(
    candidate?.status === "PREPARED" &&
    candidate.preparedAt &&
    candidate.preparationExpiresAt &&
    candidate.preparedAt <= now &&
    now < candidate.preparationExpiresAt,
  );
}

export interface BirthRootEvidence {
  profileId: string;
  createdAt: Date;
  initial: { id: string; persona: unknown; changeOrigin: string; createdAt: Date } | null;
  creations: Array<{ id: string; method: string | null; createdAt: Date; contentHash: string }>;
  genesis: Array<{
    id: string;
    method: string | null;
    origin: string | null;
    createdAt: Date;
    contentHash: string;
  }>;
}

/** Yöntem/isim tek başına soy kanıtı değildir; başlangıç persona'sı bilinen artefakta bağlanır. */
export function classifyIndependentBirthRoot(
  evidence: BirthRootEvidence,
  independentTemplateHashes: ReadonlySet<string>,
) {
  const initial = evidence.initial;
  const creation = evidence.creations[0];
  const genesis = evidence.genesis[0];
  if (
    !initial ||
    initial.changeOrigin !== "INITIAL" ||
    evidence.creations.length !== 1 ||
    evidence.genesis.length !== 1 ||
    !creation ||
    !genesis ||
    creation.method !== "TEMPLATE" ||
    genesis.method !== creation.method ||
    genesis.origin !== "AGENT_CREATION"
  )
    return null;
  // Sonradan yazılmış bir başlangıç snapshot'ı eksik tarihçenin yerine geçmez.
  for (const date of [initial.createdAt, creation.createdAt, genesis.createdAt]) {
    const delta = date.getTime() - evidence.createdAt.getTime();
    if (!Number.isFinite(delta) || delta < 0 || delta > 60_000) return null;
  }
  const initialPersonaHash = canonicalRequestHash(initial.persona);
  if (!independentTemplateHashes.has(initialPersonaHash)) return null;
  return {
    rootProfileId: evidence.profileId,
    initialPersonaVersionId: initial.id,
    initialPersonaHash,
    templateCatalogHash: canonicalRequestHash([...independentTemplateHashes].sort()),
    creationAuditId: creation.id,
    creationAuditHash: creation.contentHash,
    genesisEventId: genesis.id,
    genesisEventHash: genesis.contentHash,
    classification: "INDEPENDENT_ROOT" as const,
    provenanceBasis: "SERVER_TEMPLATE_CREATION_AND_INITIAL_CONTENT" as const,
    // İlk aktivasyon sırası bu köken sınıflandırıcısının kanıtı değildir.
    policyVersion: 1,
  };
}

export function birthPreparationPopulationFailure(input: {
  nonRetiredProfiles: number;
  livingRootMembers: number;
  managedChildren: number;
}): string | null {
  if (
    ![input.nonRetiredProfiles, input.livingRootMembers, input.managedChildren].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    )
  )
    return "POPULATION_UNKNOWN";
  if (input.managedChildren > 0) return "FIRST_PILOT_ALREADY_PREPARED";
  if (input.nonRetiredProfiles + 1 > birthPopulationLimit) return "POPULATION_LIMIT";
  if (input.livingRootMembers < 1) return "ROOT_UNKNOWN";
  if (input.livingRootMembers + 1 > birthRootLivingLimit) return "ROOT_LIMIT";
  return null;
}
