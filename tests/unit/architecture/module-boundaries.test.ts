import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";
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

interface RuntimeImports {
  specifiers: string[];
  unresolved: string[];
  isClient: boolean;
}

function stringSpecifier(node: ts.Node | undefined): string | null {
  return node !== undefined &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;
}

function importClauseHasRuntimeValue(clause: ts.ImportClause | undefined): boolean {
  if (clause === undefined) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name !== undefined || clause.namedBindings === undefined) return true;
  if (ts.isNamespaceImport(clause.namedBindings)) return true;
  return (
    clause.namedBindings.elements.length === 0 ||
    clause.namedBindings.elements.some((element) => !element.isTypeOnly)
  );
}

function exportClauseHasRuntimeValue(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return false;
  if (node.exportClause === undefined || !ts.isNamedExports(node.exportClause)) return true;
  return node.exportClause.elements.some((element) => !element.isTypeOnly);
}

function runtimeImports(source: string, fileName: string): RuntimeImports {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];
  const unresolved: string[] = [];
  let isClient = false;
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    if (statement.expression.text === "use client") isClient = true;
  }

  const record = (node: ts.Node | undefined, description: string): void => {
    const specifier = stringSpecifier(node);
    if (specifier === null)
      unresolved.push(`${description}: ${node?.getText(sourceFile) ?? "eksik"}`);
    else specifiers.push(specifier);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && importClauseHasRuntimeValue(node.importClause)) {
      record(node.moduleSpecifier, "import");
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      exportClauseHasRuntimeValue(node)
    ) {
      record(node.moduleSpecifier, "export");
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      record(
        node.arguments[0],
        node.expression.kind === ts.SyntaxKind.ImportKeyword ? "import()" : "require()",
      );
    } else if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ["Worker", "SharedWorker"].includes(node.expression.text)
    ) {
      const workerUrl = node.arguments?.[0];
      if (
        workerUrl !== undefined &&
        ts.isNewExpression(workerUrl) &&
        ts.isIdentifier(workerUrl.expression) &&
        workerUrl.expression.text === "URL"
      ) {
        record(workerUrl.arguments?.[0], `new ${node.expression.text}(new URL())`);
      } else {
        unresolved.push(
          `new ${node.expression.text}(): ${workerUrl?.getText(sourceFile) ?? "eksik"}`,
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { specifiers, unresolved, isClient };
}

function isClientEntry(source: string, fileName: string): boolean {
  return runtimeImports(source, fileName).isClient;
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
    client bileşeninden erişilemiyor — ama o bir anlık görüntüydü, garanti
    değildi (Astra, 17 Eylül 2026). Garanti burada kuruluyor.

    `server-only` paketi bu iş için KULLANILAMAZ: koşul haritasında `default`
    dalı hata fırlatan `index.js`'e gider ve yalnız `react-server` koşulunda
    boşa düşer. Runtime worker'ı düz Node'da (`tsx`) koştuğu için o paket
    worker'ı ve bu testleri kırardı.

    Tarayıcının ilk hâli atlatılabiliyordu; Astra dört kaçış ölçtü ve hepsi
    burada kapalı: dinamik `import()`, `require()`, yan etkili `import "x";`
    ve tek tırnaklı belirteç. Ayrıca `'use client'` tek tırnakla da tanınır,
    yorum bloğundan sonra gelse de görülür; `index.tsx` ve `.js` ara modüller
    çözümlenir. `import type` KASTEN sayılmaz: çalışma zamanında silinir, onu
    bağımlılık saymak testi haksız yere düşürürdü. Buna karşılık `import {}`
    Next SWC tarafından yan etkili importa çevrildiği için çalışma zamanı
    bağımlılığıdır. Kaynaksız `export { local }` ise bağımlılık değildir.
  */
  it("keeps lookbehind word-boundary helpers out of every client bundle", () => {
    const graphFiles = (function collect(directory: string): string[] {
      return readdirSync(directory).flatMap((entry) => {
        const absolute = path.join(directory, entry);
        if (statSync(absolute).isDirectory()) return collect(absolute);
        return /\.(?:ts|tsx|js|jsx|mjs|cjs)$/u.test(entry) ? [absolute] : [];
      });
    })(sourceRoot);
    const target = realpathSync(path.join(sourceRoot, "lib/text/word-boundary.ts"));
    const known = new Set(graphFiles);

    const resolveImport = (specifier: string, from: string): string | null => {
      const base = specifier.startsWith("@/")
        ? path.join(sourceRoot, specifier.slice(2))
        : specifier.startsWith(".")
          ? path.join(path.dirname(from), specifier)
          : null;
      if (base === null) return null;
      const extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
      return (
        extensions
          .map((extension) => `${base}${extension}`)
          .concat(extensions.map((extension) => path.join(base, `index${extension}`)))
          .find((candidate) => known.has(candidate)) ?? null
      );
    };

    const parsedImports = new Map(
      graphFiles.map((file) => [file, runtimeImports(readFileSync(file, "utf8"), file)]),
    );
    const importsOf = new Map(
      graphFiles.map((file) => [
        file,
        (parsedImports.get(file)?.specifiers ?? [])
          .map((specifier) => resolveImport(specifier, file))
          .filter((resolved): resolved is string => resolved !== null),
      ]),
    );

    const clientEntries = graphFiles.filter((file) => parsedImports.get(file)?.isClient === true);
    expect(
      clientEntries.length,
      "client bileşeni bulunamadı; tarama sessizce anlamsız olurdu",
    ).toBeGreaterThan(0);

    const reached = new Set<string>();
    const trails: string[] = [];
    const unresolvedTrails: string[] = [];
    const walk = (file: string, trail: readonly string[]): void => {
      if (reached.has(file)) return;
      reached.add(file);
      for (const unresolved of parsedImports.get(file)?.unresolved ?? []) {
        unresolvedTrails.push(
          `${[...trail, file].map((f) => path.relative(sourceRoot, f)).join(" -> ")}: ${unresolved}`,
        );
      }
      for (const dependency of importsOf.get(file) ?? []) {
        if (realpathSync(dependency) === target) {
          trails.push(
            [...trail, file, dependency].map((f) => path.relative(sourceRoot, f)).join(" -> "),
          );
          continue;
        }
        walk(dependency, [...trail, file]);
      }
    };
    for (const entry of clientEntries) walk(entry, []);

    expect(unresolvedTrails).toEqual([]);
    expect(trails).toEqual([]);
  });

  it("parses runtime dependency syntax without treating type-only imports as runtime", () => {
    const parsed = runtimeImports(
      `
        import type {
          TypeOnly
        } from "./types";
        import { type AlsoType } from "./also-types";
        import type { MixedType } from "./mixed-types"; import { runtime } from
          /* gap */ "./runtime";
        import {} from "./empty-runtime";
        const local = 1;
        export { local };
        export * from "./barrel";
        const lazy = import(\`./lazy\`);
        const worker = new Worker(new URL("./worker.ts", import.meta.url));
        const unknown = import(variablePath);
      `,
      "fixture.ts",
    );

    expect(parsed.specifiers).toEqual([
      "./runtime",
      "./empty-runtime",
      "./barrel",
      "./lazy",
      "./worker.ts",
    ]);
    expect(parsed.unresolved).toEqual(["import(): variablePath"]);
    expect(parsed.isClient).toBe(false);
  });

  it("recognizes use client anywhere in the directive prologue", () => {
    expect(isClientEntry(`"use strict";\n"use client";\nexport {};`, "client.tsx")).toBe(true);
    expect(isClientEntry(`const value = 1;\n"use client";`, "server.ts")).toBe(false);
  });
});
