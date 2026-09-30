import originalPersonaPack from "./original-personas.json";
import { expandedVerifiedSources } from "./expanded-sources";
import { seedPersonaPackSchema } from "./schema";
import { uniqueVerifiedSourcePool, type PersonaSource } from "./source-assignment";

let cached: readonly PersonaSource[] | null = null;

/**
 * Doğrulanmış kaynak havuzu: kanonik paketin tekil kaynakları + genişletilmiş havuz
 * (29 Eylül 2026). Uzlaştırma betiği ve ölü kaynak değişimi aynı havuzu kullanır.
 */
export function verifiedSourcePool(): readonly PersonaSource[] {
  if (cached) return cached;
  const pool = [
    ...uniqueVerifiedSourcePool(seedPersonaPackSchema.parse(originalPersonaPack).personas),
  ];
  for (const source of expandedVerifiedSources)
    if (!pool.some(({ url }) => url === source.url)) pool.push(source);
  cached = pool;
  return pool;
}
