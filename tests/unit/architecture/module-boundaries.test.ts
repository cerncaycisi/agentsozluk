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
      "agents",
      "audit",
      "auth",
      "entries",
      "feeds",
      "idempotency",
      "indexing",
      "interactions",
      "maintenance",
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

  /*
    `word-boundary.ts` lookbehind kullanıyor. Lookbehind WebKit'e ancak Safari
    16.4'te geldi; 16.3 ve öncesinde bu kalıpları kuran `new RegExp` çağrısı
    MODÜL YÜKLENİRKEN hata verir, yani sayfayı komple düşürür. Şu an hiçbir
    client bileşeninden erişilemiyor — ama bu ölçüm bir anlık görüntüdür,
    garanti değil (Astra, 17 Eylül 2026). Garantiyi burada kuruyoruz.

    `server-only` paketi bu iş için kullanılamaz: koşul haritasında `default`
    dalı hata fırlatan `index.js`'e gider ve yalnız `react-server` koşulunda
    boşa düşer. Runtime worker'ı düz Node'da (`tsx`) koştuğu için o paket
    worker'ı ve bu testleri kırardı.
  */
  it("keeps lookbehind word-boundary helpers out of every client bundle", () => {
    const files = sourceFiles(sourceRoot);
    const target = path.join(sourceRoot, "lib/text/word-boundary.ts");

    const resolveImport = (specifier: string, from: string): string | null => {
      const base = specifier.startsWith("@/")
        ? path.join(sourceRoot, specifier.slice(2))
        : specifier.startsWith(".")
          ? path.join(path.dirname(from), specifier)
          : null;
      if (base === null) return null;
      return (
        [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find(
          (candidate) => /\.tsx?$/u.test(candidate) && files.includes(candidate),
        ) ?? null
      );
    };

    const importsOf = new Map(
      files.map((file) => [
        file,
        [...readFileSync(file, "utf8").matchAll(/from\s+"([^"]+)"/gu)]
          .map((match) => resolveImport(match[1] as string, file))
          .filter((resolved): resolved is string => resolved !== null),
      ]),
    );

    const clientEntries = files.filter((file) =>
      readFileSync(file, "utf8").slice(0, 400).includes('"use client"'),
    );
    expect(
      clientEntries.length,
      "client bileşeni bulunamadı; tarama anlamsız olurdu",
    ).toBeGreaterThan(0);

    const reached = new Set<string>();
    const trails: string[] = [];
    const walk = (file: string, trail: readonly string[]): void => {
      if (reached.has(file)) return;
      reached.add(file);
      for (const dependency of importsOf.get(file) ?? []) {
        if (dependency === target) {
          trails.push(
            [...trail, file, dependency].map((f) => path.relative(sourceRoot, f)).join(" -> "),
          );
          continue;
        }
        walk(dependency, [...trail, file]);
      }
    };
    for (const entry of clientEntries) walk(entry, []);

    expect(trails).toEqual([]);
  });
});
