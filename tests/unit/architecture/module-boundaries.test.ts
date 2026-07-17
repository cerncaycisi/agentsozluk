import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const modulesRoot = path.join(process.cwd(), "src/modules");
const sourceRoot = path.join(process.cwd(), "src");
const requiredLayers = ["domain", "application", "repository", "validation"] as const;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);
    if (statSync(absolute).isDirectory()) return sourceFiles(absolute);
    return /\.(?:ts|tsx)$/u.test(entry) ? [absolute] : [];
  });
}

describe("module boundaries", () => {
  const modules = readdirSync(modulesRoot)
    .filter((entry) => statSync(path.join(modulesRoot, entry)).isDirectory())
    .sort();

  it("gives every module real domain, application, repository, validation and public layers", () => {
    expect(modules).toEqual([
      "audit",
      "auth",
      "entries",
      "feeds",
      "idempotency",
      "interactions",
      "moderation",
      "outbox",
      "rate-limit",
      "search",
      "topics",
      "users",
    ]);

    for (const moduleName of modules) {
      const moduleRoot = path.join(modulesRoot, moduleName);
      for (const layer of requiredLayers) {
        expect(
          sourceFiles(path.join(moduleRoot, layer)),
          `${moduleName}/${layer}`,
        ).not.toHaveLength(0);
      }

      const publicEntry = readFileSync(path.join(moduleRoot, "index.ts"), "utf8");
      expect(publicEntry, `${moduleName} public exports`).toContain(`/application/`);
      expect(publicEntry, `${moduleName} public exports`).toContain(`/domain/`);
      expect(publicEntry, `${moduleName} public exports`).toContain(`/validation/`);
      expect(publicEntry, `${moduleName} repository leak`).not.toContain(`/repository/`);
    }
  });

  it("keeps domain and validation layers independent from persistence and orchestration", () => {
    for (const moduleName of modules) {
      for (const layer of ["domain", "validation"] as const) {
        for (const file of sourceFiles(path.join(modulesRoot, moduleName, layer))) {
          const source = readFileSync(file, "utf8");
          expect(source, path.relative(process.cwd(), file)).not.toMatch(
            /@\/modules\/[^"']+\/(?:application|repository)\//u,
          );
        }
      }
    }
  });

  it("keeps Prisma imports inside repository or shared database data-access code", () => {
    const violations = sourceFiles(sourceRoot)
      .filter((file) => readFileSync(file, "utf8").includes('from "@prisma/client"'))
      .map((file) => path.relative(process.cwd(), file))
      .filter((file) => !file.includes("/repository/") && !file.startsWith("src/lib/db/"));

    expect(violations).toEqual([]);
  });
});
