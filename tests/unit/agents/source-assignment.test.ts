import { describe, expect, it } from "vitest";
import originalPersonaPack from "../../../src/modules/agents/personas/original-personas.json";
import {
  assignVerifiedSources,
  sourceTopicMappings,
  uniqueVerifiedSourcePool,
} from "../../../src/modules/agents/personas/source-assignment";
import {
  seedPersonaPackSchema,
  type SeedPersona,
} from "../../../src/modules/agents/personas/schema";

const pack = seedPersonaPackSchema.parse(originalPersonaPack);
const verifiedPool = uniqueVerifiedSourcePool(pack.personas);
const base = pack.personas[0]!;
const unverifiedSource = {
  ...base.sources[0]!,
  url: "https://unverified.example/feed",
};
const importedPersona: SeedPersona = {
  ...base,
  username: "imported_writer",
  sources: [...base.sources.slice(0, 4), unverifiedSource],
  sourceTopicMappings: sourceTopicMappings([...base.sources.slice(0, 4), unverifiedSource]),
};

describe("verified source assignment", () => {
  it("deterministically retains verified sources, drops unknown URLs and fills ten origins", () => {
    const first = assignVerifiedSources(importedPersona, verifiedPool);
    const second = assignVerifiedSources(importedPersona, [...verifiedPool].reverse());
    const urls = new Set(first.map(({ url }) => url));

    expect(first).toEqual(second);
    expect(first).toHaveLength(10);
    expect(urls.has(unverifiedSource.url)).toBe(false);
    for (const { url } of base.sources.slice(0, 4)) expect(urls.has(url)).toBe(true);
    expect(new Set(first.map(({ url }) => new URL(url).origin)).size).toBe(10);
    expect(Object.keys(sourceTopicMappings(first))).toEqual(first.map(({ url }) => url));
  });

  it("fails closed when the verified pool cannot satisfy the minimum", () => {
    expect(() => assignVerifiedSources(importedPersona, verifiedPool.slice(0, 9))).toThrow(
      "SOURCE_ASSIGNMENT_POOL_TOO_SMALL",
    );
  });
});
