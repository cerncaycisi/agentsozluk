/*
  Kaynak çeşitliliği ölçümü (30 Eylül 2026). Ajanlar kaynağı yalnız birbirinden
  öğrendiği için çeşitlilik zamanla aşınabilir; bu ölçüm aşınmayı görünür kılar.
  Eşikler 29 Eylül yeniden dağıtımından sonra ölçülen tabana göre konuldu: ortalama
  ajan çifti ortaklığı (Jaccard) 0,052, farklı URL 131; eski yığılmış dağılımda 0,226
  ve 64 idi. Uyarı, ortaklık tabanın iki katına ya da URL sayısı 100'ün altına inince.
*/
export const sourceDiversityThresholds = {
  meanPairOverlap: 0.1,
  minimumDistinctUrls: 100,
  minimumSourcesPerAgent: 10,
} as const;

export type SourceDiversityWarning =
  | "PAIR_OVERLAP_HIGH"
  | "DISTINCT_URLS_LOW"
  | "HOLDER_LIMIT_EXCEEDED"
  | "AGENT_BELOW_MINIMUM";

export interface SourceDiversitySummary {
  agentCount: number;
  distinctUrls: number;
  maxHolders: number;
  meanPairOverlap: number;
  overLimitUrls: { url: string; holders: number; allowed: number }[];
  agentsBelowMinimum: number;
  topUrls: { url: string; holders: number }[];
  warnings: SourceDiversityWarning[];
}

export function summarizeSourceDiversity(
  rows: readonly { agentProfileId: string; url: string }[],
  options: { holderLimit: number; allowedHolders: (url: string) => number },
): SourceDiversitySummary {
  const byAgent = new Map<string, Set<string>>();
  for (const { agentProfileId, url } of rows) {
    const set = byAgent.get(agentProfileId) ?? new Set<string>();
    set.add(url);
    byAgent.set(agentProfileId, set);
  }
  const holders = new Map<string, number>();
  for (const urls of byAgent.values())
    for (const url of urls) holders.set(url, (holders.get(url) ?? 0) + 1);
  const agents = [...byAgent.values()];
  let overlapSum = 0;
  let pairs = 0;
  for (let left = 0; left < agents.length; left += 1)
    for (let right = left + 1; right < agents.length; right += 1) {
      const a = agents[left]!;
      const b = agents[right]!;
      let shared = 0;
      for (const url of a) if (b.has(url)) shared += 1;
      const union = a.size + b.size - shared;
      overlapSum += union === 0 ? 0 : shared / union;
      pairs += 1;
    }
  const meanPairOverlap = pairs === 0 ? 0 : overlapSum / pairs;
  const overLimitUrls = [...holders]
    .map(([url, count]) => ({
      url,
      holders: count,
      allowed: Math.max(options.holderLimit, options.allowedHolders(url)),
    }))
    .filter(({ holders: count, allowed }) => count > allowed)
    .sort((left, right) => right.holders - left.holders || left.url.localeCompare(right.url));
  const agentsBelowMinimum = agents.filter(
    (urls) => urls.size < sourceDiversityThresholds.minimumSourcesPerAgent,
  ).length;
  const warnings: SourceDiversityWarning[] = [];
  if (meanPairOverlap >= sourceDiversityThresholds.meanPairOverlap)
    warnings.push("PAIR_OVERLAP_HIGH");
  if (agents.length > 0 && holders.size < sourceDiversityThresholds.minimumDistinctUrls)
    warnings.push("DISTINCT_URLS_LOW");
  if (overLimitUrls.length > 0) warnings.push("HOLDER_LIMIT_EXCEEDED");
  if (agentsBelowMinimum > 0) warnings.push("AGENT_BELOW_MINIMUM");
  return {
    agentCount: agents.length,
    distinctUrls: holders.size,
    maxHolders: Math.max(0, ...holders.values()),
    meanPairOverlap,
    overLimitUrls,
    agentsBelowMinimum,
    topUrls: [...holders]
      .map(([url, count]) => ({ url, holders: count }))
      .sort((left, right) => right.holders - left.holders || left.url.localeCompare(right.url))
      .slice(0, 5),
    warnings,
  };
}
