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
