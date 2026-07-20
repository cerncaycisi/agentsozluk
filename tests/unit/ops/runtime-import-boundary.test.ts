import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const runtimeEntrypoints = [
  "scripts/agent-runtime-worker.ts",
  "scripts/agent-codex-status.ts",
  "scripts/agent-capability.ts",
] as const;
const localImportPattern =
  /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/gu;

function resolveLocalImport(importer: string, specifier: string): string | null {
  const unresolved = specifier.startsWith("@/")
    ? path.join(repositoryRoot, "src", specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(importer), specifier)
      : null;
  if (!unresolved) return null;
  for (const candidate of [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    `${unresolved}.json`,
    path.join(unresolved, "index.ts"),
    path.join(unresolved, "index.tsx"),
  ])
    if (existsSync(candidate)) return candidate;
  throw new Error(`Runtime import çözümlenemedi: ${specifier} (${importer})`);
}

function runtimeImportClosure(): Set<string> {
  const pending = runtimeEntrypoints.map((entrypoint) => path.join(repositoryRoot, entrypoint));
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    if (path.extname(current) === ".json") continue;
    const source = readFileSync(current, "utf8");
    for (const match of source.matchAll(localImportPattern)) {
      const dependency = resolveLocalImport(current, match[1] ?? match[2]!);
      if (dependency && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return visited;
}

describe("production runtime import boundary", () => {
  it("keeps host runtime entrypoints out of application barrels and native auth/database modules", () => {
    const closure = runtimeImportClosure();
    const relativeClosure = [...closure].map((file) =>
      path.relative(repositoryRoot, file).split(path.sep).join("/"),
    );
    expect(
      relativeClosure.filter((file) => /^src\/modules\/[^/]+\/index\.tsx?$/u.test(file)),
    ).toEqual([]);
    expect(relativeClosure).not.toContain("src/modules/auth/domain/password.ts");
    for (const file of closure) {
      if (path.extname(file) === ".json") continue;
      expect(readFileSync(file, "utf8")).not.toMatch(
        /(?:from\s+["']@node-rs\/argon2["']|from\s+["']@prisma\/client["'])/u,
      );
    }
  });
});
