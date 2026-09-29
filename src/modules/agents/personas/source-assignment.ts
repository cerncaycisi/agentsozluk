import { createHash } from "node:crypto";
import type { SeedPersona } from "./schema";

export type PersonaSource = SeedPersona["sources"][number];

export const VERIFIED_SOURCE_REDUNDANCY = 2;

export function reconciledCanonicalAdminPinned(
  current: { adminBlocked: boolean; status: string } | null,
  canonicalPinned: boolean,
): boolean {
  return current?.adminBlocked || current?.status === "BLOCKED" ? false : canonicalPinned;
}

function normalizedTopic(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll(/\p{Mark}+/gu, "")
    .toLocaleLowerCase("tr-TR")
    .replaceAll(/[^a-z0-9]+/gu, " ")
    .trim();
}

function sourceAffinityTopics(persona: SeedPersona): Set<string> {
  return new Set(
    [
      ...persona.interests.map(({ key }) => key),
      ...persona.sources.flatMap(({ topics }) => topics),
      ...Object.values(persona.sourceTopicMappings).flat(),
    ]
      .map(normalizedTopic)
      .filter(Boolean),
  );
}

function deterministicTieBreak(username: string, url: string): string {
  return createHash("sha256").update(`${username}\0${url}`).digest("hex");
}

export function uniqueVerifiedSourcePool(personas: SeedPersona[]): PersonaSource[] {
  const byUrl = new Map<string, PersonaSource>();
  for (const source of personas.flatMap(({ sources }) => sources)) {
    if (!byUrl.has(source.url)) byUrl.set(source.url, source);
  }
  return [...byUrl.values()].sort((left, right) => left.url.localeCompare(right.url));
}

export function assignVerifiedSources(
  persona: SeedPersona,
  verifiedPool: PersonaSource[],
  minimum = 10,
): PersonaSource[] {
  const verifiedByUrl = new Map(verifiedPool.map((source) => [source.url, source]));
  const retained = persona.sources.flatMap(({ url }) => {
    const verified = verifiedByUrl.get(url);
    return verified ? [verified] : [];
  });
  const retainedUrls = new Set(retained.map(({ url }) => url));
  const affinityTopics = sourceAffinityTopics(persona);
  const targetCount = Math.min(20, Math.max(minimum + VERIFIED_SOURCE_REDUNDANCY, retained.length));
  const candidates = verifiedPool
    .filter(({ url }) => !retainedUrls.has(url))
    .map((source) => ({
      source,
      affinity: source.topics.reduce(
        (total, topic) => total + (affinityTopics.has(normalizedTopic(topic)) ? 1 : 0),
        0,
      ),
      tieBreak: deterministicTieBreak(persona.username, source.url),
    }))
    .sort(
      (left, right) =>
        right.affinity - left.affinity || left.tieBreak.localeCompare(right.tieBreak),
    )
    .map(({ source }) => source);
  const assigned = [...retained, ...candidates].slice(0, targetCount);
  if (assigned.length < minimum)
    throw new Error(
      `SOURCE_ASSIGNMENT_POOL_TOO_SMALL username=${persona.username} assigned=${assigned.length} required=${minimum}`,
    );
  return assigned;
}

export function sourceTopicMappings(sources: PersonaSource[]): SeedPersona["sourceTopicMappings"] {
  return Object.fromEntries(sources.map((source) => [source.url, source.topics]));
}

/*
  Çeşitlendirilmiş ortak kaynak planı (29 Eylül 2026). `assignVerifiedSources` her personayı ayrı
  doldurduğu ve yakınlığa personanın MEVCUT kaynaklarının konularını da kattığı için küçük havuz
  herkese aynı kaynakları veriyordu (arkitera 35 ajanın 33'ünde). Burada:
  - yakınlık yalnız personanın ilgi alanlarından (ağırlıklı, kelime kökü eşleşmesiyle) gelir;
  - ajanlar sırayla birer kaynak seçer, bir kaynak en fazla `holderLimit` ajana gider;
  - sabit kaynaklı (kanonik paket) personalar sınıra sayılır ama değişmez;
  - sınır yüzünden alt sınıra ulaşılamazsa en az ajanda olan kaynaklarla tamamlanır.
*/
export interface DiverseSourceTarget {
  username: string;
  persona: SeedPersona;
  /**
   * Kanonik paket kaynakları: değişmez ve sınıra sayılır. İnsanca seçilmiş paket istisnadır;
   * sabit kaynakların kendisi sınırı aşabilir (ör. iki paket aynı kaynağı içeriyorsa), sınır
   * yalnız planın yaptığı atamalar için sözleşmedir.
   */
  fixedSources?: PersonaSource[];
  /** Bu ajan için seçilemeyecek URL'ler (ör. yönetici ya da önceki uzlaştırma engeli). */
  excludedUrls?: ReadonlySet<string>;
}

function topicStems(value: string): string[] {
  return value
    .toLocaleLowerCase("tr-TR")
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length >= 3 && !["ile", "için"].includes(word))
    .map((word) => word.slice(0, 4));
}

export function sourceInterestAffinity(persona: SeedPersona, source: PersonaSource): number {
  const sourceStems = new Set(source.topics.flatMap(topicStems));
  return persona.interests.reduce(
    (total, { key, weight }) =>
      total + (topicStems(key).some((stem) => sourceStems.has(stem)) ? weight : 0),
    0,
  );
}

export function planDiverseSourceAssignment(
  targets: readonly DiverseSourceTarget[],
  pool: readonly PersonaSource[],
  options: { holderLimit?: number; perAgent?: number; minimum?: number } = {},
): Map<string, PersonaSource[]> {
  const holderLimit = options.holderLimit ?? 5;
  const perAgent = options.perAgent ?? 12;
  const minimum = options.minimum ?? 10;
  const holders = new Map<string, number>();
  const hold = (url: string) => holders.set(url, (holders.get(url) ?? 0) + 1);
  const plan = new Map<string, PersonaSource[]>();
  for (const target of targets)
    if (target.fixedSources) {
      plan.set(target.username, [...target.fixedSources]);
      for (const { url } of target.fixedSources) hold(url);
    }
  const open = [...targets]
    .filter((target) => !target.fixedSources)
    .sort((left, right) => left.username.localeCompare(right.username));
  for (const target of open) plan.set(target.username, []);
  const staticRank = new Map<string, { affinity: number; tieBreak: string }>();
  const rank = (target: DiverseSourceTarget, source: PersonaSource) => {
    const key = `${target.username}\0${source.url}`;
    let fixed = staticRank.get(key);
    if (!fixed) {
      fixed = {
        affinity: sourceInterestAffinity(target.persona, source),
        tieBreak: deterministicTieBreak(target.username, source.url),
      };
      staticRank.set(key, fixed);
    }
    return { ...fixed, held: holders.get(source.url) ?? 0 };
  };
  const better = (left: ReturnType<typeof rank>, right: ReturnType<typeof rank>): boolean =>
    left.affinity !== right.affinity
      ? left.affinity > right.affinity
      : left.held !== right.held
        ? left.held < right.held
        : left.tieBreak < right.tieBreak;
  for (let round = 0; round < perAgent; round += 1)
    for (const target of open) {
      const chosen = plan.get(target.username)!;
      const taken = new Set(chosen.map(({ url }) => url));
      let best: { source: PersonaSource; score: ReturnType<typeof rank> } | null = null;
      for (const source of pool) {
        if (
          taken.has(source.url) ||
          target.excludedUrls?.has(source.url) ||
          (holders.get(source.url) ?? 0) >= holderLimit
        )
          continue;
        const score = rank(target, source);
        if (!best || better(score, best.score)) best = { source, score };
      }
      if (best) {
        chosen.push(best.source);
        hold(best.source.url);
      }
    }
  for (const target of open) {
    const chosen = plan.get(target.username)!;
    while (chosen.length < minimum) {
      const taken = new Set(chosen.map(({ url }) => url));
      // Alt sınıra tamamlama da sınırı gözetir; kapasite yetmezse hata verir (Astra 2ff4b2a P2).
      const fallback = pool
        .filter(
          ({ url }) =>
            !taken.has(url) &&
            !target.excludedUrls?.has(url) &&
            (holders.get(url) ?? 0) < holderLimit,
        )
        .sort(
          (left, right) =>
            (holders.get(left.url) ?? 0) - (holders.get(right.url) ?? 0) ||
            deterministicTieBreak(target.username, left.url).localeCompare(
              deterministicTieBreak(target.username, right.url),
            ),
        )[0];
      if (!fallback)
        throw new Error(
          `SOURCE_ASSIGNMENT_CAPACITY_EXCEEDED username=${target.username} assigned=${chosen.length} required=${minimum} holderLimit=${holderLimit}`,
        );
      chosen.push(fallback);
      hold(fallback.url);
    }
  }
  return plan;
}
