import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

interface BaselineAgent {
  inspired_by_public_handle?: string;
  system_prompt?: string;
}

interface BaselinePack {
  agents?: BaselineAgent[];
}

const zipPath = process.argv[2];
if (!zipPath) {
  throw new Error("Usage: tsx scripts/build-persona-baseline-signatures.ts <baseline.zip>");
}

const normalize = (value: string): string[] =>
  value
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .split(/\s+/gu)
    .filter(Boolean);

const hash = (value: string, length = 16): string =>
  createHash("sha256").update(value).digest("hex").slice(0, length);

const ngramHashes = (tokens: string[], size: number): string[] => {
  const values = new Set<string>();
  for (let index = 0; index <= tokens.length - size; index += 1) {
    values.add(hash(tokens.slice(index, index + size).join(" ")));
  }
  return [...values].sort();
};

const flattenStrings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(flattenStrings);
  return [];
};

const list = spawnSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
if (list.status !== 0) throw new Error(list.stderr || "Cannot list baseline ZIP.");
const jsonEntries = list.stdout
  .split(/\r?\n/u)
  .filter((entry) => entry.endsWith(".json") && !entry.includes("__MACOSX"));
if (jsonEntries.length !== 1) {
  throw new Error(`Expected one baseline JSON file, found ${jsonEntries.length}.`);
}

const extracted = spawnSync("unzip", ["-p", zipPath, jsonEntries[0]!], {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
});
if (extracted.status !== 0) throw new Error(extracted.stderr || "Cannot read baseline JSON.");
const pack = JSON.parse(extracted.stdout) as BaselinePack;
if (!Array.isArray(pack.agents) || pack.agents.length !== 10) {
  throw new Error("Baseline JSON must contain exactly 10 profiles.");
}

const profiles = pack.agents
  .map((agent) => {
    const prompt = agent.system_prompt ?? "";
    if (prompt.length < 100) throw new Error("Baseline profile prompt is missing.");
    return {
      sortKey: hash(prompt, 64),
      ngramHashes: ngramHashes(normalize(prompt), 7),
    };
  })
  .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
  .map(({ ngramHashes: hashes }, index) => ({
    anonymousId: `baseline-${String(index + 1).padStart(2, "0")}`,
    ngramHashes: hashes,
  }));

const normalizedHandles = pack.agents
  .map((agent) => agent.inspired_by_public_handle ?? "")
  .filter(Boolean)
  .map((handle) => normalize(handle).join(" "));

const personaPackPath = path.resolve("src/modules/agents/personas/original-personas.json");
const personaPackRaw = readFileSync(personaPackPath, "utf8");
const candidateTokens = normalize(flattenStrings(JSON.parse(personaPackRaw)).join(" "));
const candidatePhrases = new Set<string>();
for (let size = 1; size <= 5; size += 1) {
  for (let index = 0; index <= candidateTokens.length - size; index += 1) {
    candidatePhrases.add(candidateTokens.slice(index, index + size).join(" "));
  }
}
if (normalizedHandles.some((handle) => candidatePhrases.has(handle))) {
  throw new Error("Candidate persona pack contains a blocked source identity.");
}

const output = {
  version: 1,
  normalization: "NFKD-lower-alphanumeric",
  ngramSize: 7,
  hash: "sha256-truncated-64-bit",
  profileCount: profiles.length,
  profiles,
  identityScanPassed: true,
  candidatePackHash: hash(personaPackRaw, 64),
};

const outputPath = path.resolve("src/modules/agents/personas/baseline-signatures.json");
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(
  `Wrote anonymous fingerprints for ${profiles.length} baseline profiles; no source text or identity labels retained.\n`,
);
