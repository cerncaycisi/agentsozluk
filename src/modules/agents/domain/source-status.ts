export const agentSourceStatuses = [
  "SEED",
  "DISCOVERED",
  "PROBATION",
  "TRUSTED",
  "DORMANT",
  "REJECTED",
  "BLOCKED",
] as const;

export type AgentSourceStatusValue = (typeof agentSourceStatuses)[number];

/*
  DISCOVERED = ajanın önerdiği, onay bekleyen kaynak (30 Eylül 2026). Okunmaz, sunulmaz,
  sayılmaz; yönetici onayıyla SEED olur, reddiyle REJECTED. Önceden sunulabilir sayılıyordu
  ama hiçbir yol bu durumu üretmiyordu (üretimde 0 satır).
*/
const presentableSourceStatuses = ["SEED", "PROBATION", "TRUSTED"] as const;
const citableSourceStatuses = ["PROBATION", "TRUSTED"] as const;
const discoverySourceStatuses = ["PROBATION"] as const;
const probationEntrySourceStatuses = ["SEED"] as const;
const resultRecordableSourceStatuses = [...presentableSourceStatuses, "DORMANT"] as const;

/**
 * Canlı SAYILMAYAN durumlar: bu satırlar çekilmez ve sunulmaz. Ajan başına stok
 * (`runtimeAgentSourceLimit`) ve kaynak başına sahip (`runtimeSourceHolderLimit`)
 * sayımları, aday sorgusu ve uzlaştırma aynı listeyi kullanır. DORMANT (ölü kaynak,
 * 30 Eylül 2026) eklenmeden önce ölü kaynaklar kota ve sınır işgal ediyordu.
 */
export const runtimeUncountedSourceStatuses = [
  "DISCOVERED",
  "DORMANT",
  "REJECTED",
  "BLOCKED",
] as const;

/**
 * Runtime source status policy. Keep status membership here so perception,
 * fetch-result handling, provenance and reporting cannot silently drift apart.
 */
export const runtimeSourceStatusContract = {
  presentable: presentableSourceStatuses,
  citable: citableSourceStatuses,
  discovery: discoverySourceStatuses,
  probationEntry: probationEntrySourceStatuses,
  resultRecordable: resultRecordableSourceStatuses,
} as const;

export const runtimePresentableSourceStatuses = runtimeSourceStatusContract.presentable;
export const runtimeCitableSourceStatuses = runtimeSourceStatusContract.citable;
export const runtimeDiscoverySourceStatuses = runtimeSourceStatusContract.discovery;
export const runtimeProbationEntrySourceStatuses = runtimeSourceStatusContract.probationEntry;
export const runtimeResultRecordableSourceStatuses = runtimeSourceStatusContract.resultRecordable;

export function isRuntimePresentableSourceStatus(status: string): boolean {
  return runtimePresentableSourceStatuses.includes(
    status as (typeof runtimePresentableSourceStatuses)[number],
  );
}

export function isRuntimeCitableSourceStatus(status: string): boolean {
  return runtimeCitableSourceStatuses.includes(
    status as (typeof runtimeCitableSourceStatuses)[number],
  );
}

export function isRuntimeProbationEntrySourceStatus(status: string): boolean {
  return runtimeProbationEntrySourceStatuses.includes(
    status as (typeof runtimeProbationEntrySourceStatuses)[number],
  );
}

const sourceEvidenceTypeByStatus = {
  PROBATION: "PROBATION_SOURCE",
  TRUSTED: "TRUSTED_SOURCE",
} as const;

export type RuntimeSourceEvidenceType =
  | (typeof sourceEvidenceTypeByStatus)[keyof typeof sourceEvidenceTypeByStatus]
  | "MULTIPLE_SOURCES";

const sourceStatusesByEvidenceType = {
  PROBATION_SOURCE: ["PROBATION"],
  TRUSTED_SOURCE: ["TRUSTED"],
  MULTIPLE_SOURCES: citableSourceStatuses,
} as const;

export function runtimeSourceStatusesForEvidenceType(
  evidenceType: RuntimeSourceEvidenceType,
): readonly AgentSourceStatusValue[] {
  return sourceStatusesByEvidenceType[evidenceType];
}

export function runtimeSourceEvidenceTypeForStatus(
  status: string,
): RuntimeSourceEvidenceType | null {
  return sourceEvidenceTypeByStatus[status as keyof typeof sourceEvidenceTypeByStatus] ?? null;
}
