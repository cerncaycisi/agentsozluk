import { canonicalRequestHash } from "@/modules/idempotency/domain/idempotency";
import type { BirthAcceptanceReport } from "@/modules/agents/validation/birth-schemas";
import {
  birthPopulationLimit,
  birthRootLivingLimit,
} from "@/modules/agents/domain/birth-preparation";
import {
  summarizeFreshSourceCoverage,
  type FreshSourceInput,
} from "@/modules/agents/domain/fresh-source-coverage";

export const birthAcceptanceWindowMs = 7 * 24 * 60 * 60 * 1000;
export const birthAcceptanceFreshnessMs = 24 * 60 * 60 * 1000;

/** `username` alanına burada değişmez profil ID'si verilir; eski raporun havuz anlamı değişmez. */
export function evaluateBirthSourceCoverage(
  sources: readonly FreshSourceInput[],
  childProfileId: string,
  now: Date,
) {
  const window = { from: new Date(now.getTime() - birthAcceptanceWindowMs), to: now };
  const child = summarizeFreshSourceCoverage(
    sources.filter((row) => row.username === childProfileId),
    [childProfileId],
    window,
  );
  const established = summarizeFreshSourceCoverage(
    sources.filter((row) => row.username !== childProfileId),
    [],
    window,
  );
  const coverage = child.byAgent.get(childProfileId)!;
  const failures: string[] = [];
  if (child.invalidTopicPayloads || established.invalidTopicPayloads)
    failures.push("SOURCE_METADATA_INVALID");
  if (coverage.sources < 10 || coverage.origins < 6 || coverage.categories < 5)
    failures.push("CHILD_SOURCE_FLOOR");
  if (
    established.poolSources < 50 ||
    established.poolOrigins < 30 ||
    established.poolTurkishOrTurkeyFocusedSources < 20
  )
    failures.push("ESTABLISHED_SOURCE_FLOOR");
  return {
    failures,
    window,
    child: coverage,
    established: {
      sources: established.poolSources,
      origins: established.poolOrigins,
      turkishOrTurkeyFocusedSources: established.poolTurkishOrTurkeyFocusedSources,
    },
  };
}

export interface BirthLifecycleTransition {
  from: string;
  to: string;
  occurredAt: Date;
  auditCreatedAt: Date;
}
export interface BirthLifecycleHistory {
  profileId: string;
  createdAt: Date;
  initialStatus: string;
  currentStatus: string;
  // Repository'nin eşlediği bütün lifecycle audit/event kayıtları; eksik eşleşme false.
  complete: boolean;
  transitions: BirthLifecycleTransition[];
}

/** Min(timestamp) tek başına ilk aktivasyon değildir: kuruluşundan bugüne kesintisiz zincir gerekir. */
export function firstProvenBirthActivation(
  history: BirthLifecycleHistory,
  now: Date,
): { known: boolean; activatedAt: Date | null } {
  const validStatuses = new Set(["DRAFT", "PAUSED", "ACTIVE", "SUSPENDED", "RETIRED"]);
  if (
    !history.complete ||
    !validStatuses.has(history.initialStatus) ||
    !Number.isFinite(history.createdAt.getTime()) ||
    history.createdAt > now
  )
    return { known: false, activatedAt: null };
  let status = history.initialStatus;
  let previous = history.createdAt;
  let first = status === "ACTIVE" ? history.createdAt : null;
  for (const row of [...history.transitions].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  )) {
    if (
      !validStatuses.has(row.to) ||
      row.from !== status ||
      !Number.isFinite(row.occurredAt.getTime()) ||
      !Number.isFinite(row.auditCreatedAt.getTime()) ||
      row.occurredAt <= previous ||
      row.occurredAt > now ||
      row.auditCreatedAt > now ||
      Math.abs(row.auditCreatedAt.getTime() - row.occurredAt.getTime()) > 60_000
    )
      return { known: false, activatedAt: null };
    if (row.to === "ACTIVE" && !first) first = row.occurredAt;
    previous = row.occurredAt;
    status = row.to;
  }
  return { known: status === history.currentStatus, activatedAt: first };
}

export function evaluateBirthLineageActivation(input: {
  now: Date;
  childProfileId: string;
  rootProfileId: string;
  nonRetiredProfiles: number;
  livingRootMembers: number;
  managedChildren: number;
  // Yeni çocuk dahil bütün fiziksel profiller. Kök sınıflandırması olmayanlar null kalır.
  profiles: Array<{
    profileId: string;
    rootProfileId: string | null;
    history: BirthLifecycleHistory;
  }>;
}) {
  const failures: string[] = [];
  if (
    ![input.nonRetiredProfiles, input.livingRootMembers, input.managedChildren].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    )
  )
    failures.push("POPULATION_UNKNOWN");
  else {
    // PAUSED hazırlanmış çocuk zaten nüfusta ve soyda sayılır; ikinci kez +1 eklenmez.
    if (input.nonRetiredProfiles > birthPopulationLimit) failures.push("POPULATION_LIMIT");
    if (input.livingRootMembers < 2 || input.livingRootMembers > birthRootLivingLimit)
      failures.push("ROOT_LIMIT");
    if (input.managedChildren !== 1) failures.push("FIRST_PILOT_IDENTITY_MISMATCH");
  }
  const ids = input.profiles.map((row) => row.profileId);
  if (
    new Set(ids).size !== ids.length ||
    !ids.includes(input.childProfileId) ||
    !ids.includes(input.rootProfileId)
  )
    failures.push("ACTIVATION_HISTORY_UNKNOWN");
  const activations: Array<{ profileId: string; rootProfileId: string | null; activatedAt: Date }> =
    [];
  for (const row of input.profiles) {
    const first = firstProvenBirthActivation(row.history, input.now);
    if (row.history.profileId !== row.profileId || !first.known)
      failures.push("ACTIVATION_HISTORY_UNKNOWN");
    if (first.activatedAt) {
      if (row.profileId === input.childProfileId) failures.push("CHILD_ALREADY_ACTIVATED");
      activations.push({
        profileId: row.profileId,
        rootProfileId: row.rootProfileId,
        activatedAt: first.activatedAt,
      });
    }
  }
  const weekStart = input.now.getTime() - birthAcceptanceWindowMs;
  if (
    activations.some(
      (row) => row.rootProfileId === input.rootProfileId && row.activatedAt.getTime() >= weekStart,
    )
  )
    failures.push("ROOT_ACTIVATION_COOLDOWN");
  activations.sort((a, b) => b.activatedAt.getTime() - a.activatedAt.getTime());
  const recent = activations.slice(0, 3);
  // İlk pilot kurulu toplum içindir. Eşzamanlı kayıtların son-dört sınırını keyfi ID ile kesme.
  if (
    recent.length !== 3 ||
    recent.some(
      (row, i) =>
        row.activatedAt >= input.now ||
        activations[i + 1]?.activatedAt.getTime() === row.activatedAt.getTime(),
    )
  )
    failures.push("ACTIVATION_ORDER_UNKNOWN");
  if (recent.some((row) => row.rootProfileId === null)) failures.push("RECENT_LINEAGE_UNKNOWN");
  const roots = new Set([
    input.rootProfileId,
    ...recent.flatMap((row) => (row.rootProfileId ? [row.rootProfileId] : [])),
  ]);
  if (roots.size < 2) failures.push("RECENT_ROOT_DIVERSITY");
  return {
    failures: [...new Set(failures)],
    recentFirstActivations: recent.map((row) => ({
      ...row,
      activatedAt: row.activatedAt.toISOString(),
    })),
  };
}

/** Global ayarlar; scan saatleri, editör kimliği ve sürüm sayacı konfigürasyon değildir. */
export function birthAcceptanceConfigurationHash(settings: Record<string, unknown>) {
  const excluded = new Set([
    "id",
    "settingsVersion",
    "updatedAt",
    "updatedById",
    "lastBirthScanAt",
    "lastBirthCandidateAt",
  ]);
  return canonicalRequestHash(
    Object.fromEntries(Object.entries(settings).filter(([key]) => !excluded.has(key))),
  );
}

export function birthAcceptanceReportFailure(input: {
  report: BirthAcceptanceReport;
  reportHash: string;
  deploymentSha: string;
  configurationHash: string;
  promptProfileHash: string;
  activeProfileIds: string[];
  now: Date;
}): string | null {
  const { report } = input;
  if (canonicalRequestHash(report) !== input.reportHash) return "ACCEPTANCE_REPORT_HASH_MISMATCH";
  if (!/^[a-f0-9]{40}$/u.test(input.deploymentSha) || report.deploymentSha !== input.deploymentSha)
    return "ACCEPTANCE_DEPLOYMENT_MISMATCH";
  if (
    report.configurationHash !== input.configurationHash ||
    report.promptProfileHash !== input.promptProfileHash
  )
    return "ACCEPTANCE_CONFIGURATION_MISMATCH";
  const from = new Date(report.windowFrom).getTime();
  const to = new Date(report.windowTo).getTime();
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    to - from < birthAcceptanceWindowMs ||
    to > input.now.getTime() ||
    input.now.getTime() - to > birthAcceptanceFreshnessMs
  )
    return "ACCEPTANCE_WINDOW_INVALID";
  if (
    canonicalRequestHash([...report.cohortProfileIds].sort()) !==
    canonicalRequestHash([...input.activeProfileIds].sort())
  )
    return "ACCEPTANCE_COHORT_MISMATCH";
  return null;
}
