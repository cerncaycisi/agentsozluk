import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const apiRoot = path.join(repositoryRoot, "src/app/api");
const documentPath = path.join(repositoryRoot, "docs/API.md");

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const handlerPattern = new RegExp(
  String.raw`export\s+(?:async\s+)?function\s+(${methods.join("|")})\s*\(`,
  "gu",
);
// Endpoint tablosu satırı: `| GET | \`/api/v1/...\` | ... |`
const tableRowPattern = new RegExp(
  String.raw`^\|\s*(${methods.join("|")})\s*\|\s*\x60(/api/[^\x60]+)\x60`,
  "u",
);

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(target);
    return entry.name === "route.ts" ? [target] : [];
  });
}

function routePathFor(file: string): string {
  const relative = path.relative(path.join(repositoryRoot, "src/app"), path.dirname(file));
  const segments = relative
    .split(path.sep)
    .map((segment) => segment.replace(/^\[([^\]]+)\]$/u, "{$1}"));
  return `/${segments.join("/")}`;
}

function implementedOperations(): Set<string> {
  const operations = new Set<string>();
  for (const file of routeFiles(apiRoot)) {
    const source = readFileSync(file, "utf8");
    const routePath = routePathFor(file);
    for (const match of source.matchAll(handlerPattern))
      operations.add(`${match[1]!} ${routePath}`);
  }
  return operations;
}

function documentedOperations(): Set<string> {
  const operations = new Set<string>();
  for (const line of readFileSync(documentPath, "utf8").split("\n")) {
    const match = tableRowPattern.exec(line.trim());
    if (!match) continue;
    // Tabloda örnek query string bulunabilir; sözleşme yalnız path'tir.
    operations.add(`${match[1]!} ${match[2]!.split("?")[0]!}`);
  }
  return operations;
}

describe("docs/API.md endpoint coverage", () => {
  const implemented = implementedOperations();
  const documented = documentedOperations();

  it("finds every route handler on disk", () => {
    expect(routeFiles(apiRoot).length).toBeGreaterThan(0);
    expect(implemented.size).toBeGreaterThan(0);
  });

  it("documents every implemented operation", () => {
    const missing = [...implemented].filter((operation) => !documented.has(operation)).sort();
    expect(
      missing,
      `docs/API.md bu operation'ları belgelemiyor; endpoint tablosuna satır ekleyin:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("documents no operation that does not exist", () => {
    const unknown = [...documented].filter((operation) => !implemented.has(operation)).sort();
    expect(unknown, `docs/API.md var olmayan operation belgeliyor:\n${unknown.join("\n")}`).toEqual(
      [],
    );
  });

  it("keeps the documented operation count equal to the implemented count", () => {
    expect(documented.size).toBe(implemented.size);
  });
});
