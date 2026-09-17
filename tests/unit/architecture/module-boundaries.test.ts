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
  isServer: boolean;
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
  let isServer = false;
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    if (statement.expression.text === "use client") isClient = true;
    if (statement.expression.text === "use server") isServer = true;
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
    } else if (ts.isCallExpression(node)) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")
      ) {
        record(
          node.arguments[0],
          node.expression.kind === ts.SyntaxKind.ImportKeyword ? "import()" : "require()",
        );
      } else if (ts.isPropertyAccessExpression(node.expression)) {
        const owner = node.expression.expression;
        const method = node.expression.name.text;
        if (ts.isIdentifier(owner) && owner.text === "require" && method === "resolve") {
          record(node.arguments[0], "require.resolve()");
        } else if (ts.isIdentifier(owner) && owner.text === "module" && method === "require") {
          record(node.arguments[0], "module.require()");
        } else if (
          (ts.isIdentifier(owner) && owner.text === "require" && method === "context") ||
          (ts.isMetaProperty(owner) &&
            owner.keywordToken === ts.SyntaxKind.ImportKeyword &&
            owner.name.text === "meta" &&
            method === "webpackContext")
        ) {
          // Webpack bu çağrılarda tek dosya yerine bir dizini/deseni bundle'a alır.
          // Bağlamı eksiksiz genişletmeden güvenli bir dosya grafiği kurulamaz.
          unresolved.push(
            `${node.expression.getText(sourceFile)}(): bağlam importu desteklenmiyor`,
          );
        }
      }
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
  return { specifiers, unresolved, isClient, isServer };
}

function isClientEntry(source: string, fileName: string): boolean {
  return runtimeImports(source, fileName).isClient;
}

const nextSourceExtensionOrder = ["", ".js", ".mjs", ".tsx", ".ts", ".jsx"] as const;
const codeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function sourceSpecifier(specifier: string): string {
  return specifier.replace(/[?#].*$/u, "");
}

function isLocalCodeSpecifier(specifier: string): boolean {
  const resource = sourceSpecifier(specifier);
  if (!resource.startsWith("@/") && !resource.startsWith(".")) return false;
  const extension = path.extname(resource);
  return extension === "" || codeExtensions.has(extension);
}

function resolveSourceImport(
  specifier: string,
  from: string,
  knownFiles: ReadonlySet<string>,
): string | null {
  const resource = sourceSpecifier(specifier);
  const base = resource.startsWith("@/")
    ? path.join(sourceRoot, resource.slice(2))
    : resource.startsWith(".")
      ? path.join(path.dirname(from), resource)
      : null;
  if (base === null) return null;
  return (
    nextSourceExtensionOrder
      .map((extension) => `${base}${extension}`)
      .concat(nextSourceExtensionOrder.map((extension) => path.join(base, `index${extension}`)))
      .find((candidate) => knownFiles.has(candidate)) ?? null
  );
}

interface ClientGraphTrace {
  trails: string[][];
  unresolvedTrails: Array<{ trail: string[]; issue: string }>;
}

function traceClientDependencies(
  clientEntries: readonly string[],
  parsedImports: ReadonlyMap<string, RuntimeImports>,
  importsOf: ReadonlyMap<string, readonly string[]>,
  resolutionIssues: ReadonlyMap<string, readonly string[]>,
  target: string,
  canonicalize: (file: string) => string,
): ClientGraphTrace {
  const reached = new Set<string>();
  const trails: string[][] = [];
  const unresolvedTrails: Array<{ trail: string[]; issue: string }> = [];

  const walk = (file: string, trail: readonly string[]): void => {
    const parsed = parsedImports.get(file);
    // Next, client'tan içe aktarılan dosya düzeyi Server Action modülünü
    // `createServerReference` vekiline çevirir; onun sunucu importları bundle'a girmez.
    if (trail.length > 0 && parsed?.isServer === true) return;
    if (reached.has(file)) return;
    reached.add(file);
    for (const issue of [...(parsed?.unresolved ?? []), ...(resolutionIssues.get(file) ?? [])])
      unresolvedTrails.push({ trail: [...trail, file], issue });
    for (const dependency of importsOf.get(file) ?? []) {
      if (canonicalize(dependency) === target) {
        trails.push([...trail, file, dependency]);
        continue;
      }
      walk(dependency, [...trail, file]);
    }
  };

  for (const entry of clientEntries) walk(entry, []);
  return { trails, unresolvedTrails };
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

    Tarayıcının ilk hâli atlatılabiliyordu; Astra kaçışları ölçtü ve hepsi
    burada kapalı: dinamik `import()`, `require()`, yan etkili `import "x";`
    ve tek tırnaklı belirteç. Webpack'in `require.context()` ile
    `import.meta.webpackContext()` bağlam importları eksiksiz genişletilmeden
    güvenli sayılamayacağı için fail-closed davranır. Ayrıca `'use client'` tek tırnakla da tanınır,
    yorum bloğundan sonra gelse de görülür; `index.tsx` ve `.js` ara modüller
    çözümlenir. `import type` KASTEN sayılmaz: çalışma zamanında silinir, onu
    bağımlılık saymak testi haksız yere düşürürdü. Buna karşılık `import {}`
    Next SWC tarafından yan etkili importa çevrildiği için çalışma zamanı
    bağımlılığıdır. Kaynaksız `export { local }` ise bağımlılık değildir. Next'in
    gerçek çözüm sırası (`.js`, `.mjs`, `.tsx`, `.ts`, `.jsx`) korunur; resource
    query/fragment çözümlemeden önce ayrılır. Dosya düzeyi `"use server"` modülü
    client'ta yalnız Server Action vekiline dönüştüğü için orada yürüyüş durur.
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

    const parsedImports = new Map(
      graphFiles.map((file) => [file, runtimeImports(readFileSync(file, "utf8"), file)]),
    );
    const resolutionIssues = new Map<string, string[]>();
    const importsOf = new Map<string, string[]>();
    for (const file of graphFiles) {
      const dependencies: string[] = [];
      for (const specifier of parsedImports.get(file)?.specifiers ?? []) {
        const resolved = resolveSourceImport(specifier, file, known);
        if (resolved !== null) dependencies.push(resolved);
        else if (isLocalCodeSpecifier(specifier)) {
          const issues = resolutionIssues.get(file) ?? [];
          issues.push(`çözümlenemeyen yerel import: ${specifier}`);
          resolutionIssues.set(file, issues);
        }
      }
      importsOf.set(file, dependencies);
    }

    const clientEntries = graphFiles.filter((file) => parsedImports.get(file)?.isClient === true);
    expect(
      clientEntries.length,
      "client bileşeni bulunamadı; tarama sessizce anlamsız olurdu",
    ).toBeGreaterThan(0);

    const trace = traceClientDependencies(
      clientEntries,
      parsedImports,
      importsOf,
      resolutionIssues,
      target,
      realpathSync,
    );
    const trails = trace.trails.map((trail) =>
      trail.map((file) => path.relative(sourceRoot, file)).join(" -> "),
    );
    const unresolvedTrails = trace.unresolvedTrails.map(
      ({ trail, issue }) =>
        `${trail.map((file) => path.relative(sourceRoot, file)).join(" -> ")}: ${issue}`,
    );

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
        import "./side-effect";
        const local = 1;
        const cjs = require("./cjs");
        const resolved = require.resolve("./resolved");
        const moduleCjs = module.require("./module-cjs");
        export { local };
        export * from "./barrel";
        const lazy = import(\`./lazy\`);
        const worker = new Worker(new URL("./worker.ts", import.meta.url));
        const unknown = import(variablePath);
        const context = require.context("./context", false, /module/u);
        const webpackContext = import.meta.webpackContext("./webpack-context", {
          recursive: false,
          regExp: /module/u,
        });
      `,
      "fixture.ts",
    );

    expect(parsed.specifiers).toEqual([
      "./runtime",
      "./empty-runtime",
      "./side-effect",
      "./cjs",
      "./resolved",
      "./module-cjs",
      "./barrel",
      "./lazy",
      "./worker.ts",
    ]);
    expect(parsed.unresolved).toEqual([
      "import(): variablePath",
      "require.context(): bağlam importu desteklenmiyor",
      "import.meta.webpackContext(): bağlam importu desteklenmiyor",
    ]);
    expect(parsed.isClient).toBe(false);
    expect(parsed.isServer).toBe(false);
  });

  it("mirrors Next source resolution order and resource modifiers", () => {
    const from = path.join(sourceRoot, "components/review-client.tsx");
    const bridgeJs = path.join(sourceRoot, "lib/review-bridge.js");
    const bridgeTs = path.join(sourceRoot, "lib/review-bridge.ts");
    const target = path.join(sourceRoot, "lib/text/word-boundary.ts");
    const known = new Set([bridgeJs, bridgeTs, target]);

    expect(resolveSourceImport("@/lib/review-bridge", from, known)).toBe(bridgeJs);
    expect(resolveSourceImport("@/lib/text/word-boundary?review", from, known)).toBe(target);
    expect(resolveSourceImport("@/lib/text/word-boundary#review", from, known)).toBe(target);
    expect(resolveSourceImport("@/lib/text/word-boundary.js", from, known)).toBeNull();
  });

  it("proves the client graph reaches a forbidden target but stops at a Server Action", () => {
    const client = "client.tsx";
    const bridge = "bridge.ts";
    const serverAction = "server-action.ts";
    const target = "word-boundary.ts";
    const parsed = new Map<string, RuntimeImports>([
      [client, { specifiers: [], unresolved: [], isClient: true, isServer: false }],
      [
        bridge,
        {
          specifiers: [],
          unresolved: ["dinamik yerel import"],
          isClient: false,
          isServer: false,
        },
      ],
      [serverAction, { specifiers: [], unresolved: [], isClient: false, isServer: true }],
      [target, { specifiers: [], unresolved: [], isClient: false, isServer: false }],
    ]);
    const imports = new Map<string, string[]>([
      [client, [bridge, serverAction]],
      [bridge, [target]],
      [serverAction, [target]],
      [target, []],
    ]);

    expect(
      traceClientDependencies([client], parsed, imports, new Map(), target, (file) => file),
    ).toEqual({
      trails: [[client, bridge, target]],
      unresolvedTrails: [{ trail: [client, bridge], issue: "dinamik yerel import" }],
    });
  });

  it("recognizes client and server boundaries anywhere in the directive prologue", () => {
    expect(isClientEntry(`"use strict";\n"use client";\nexport {};`, "client.tsx")).toBe(true);
    expect(isClientEntry(`const value = 1;\n"use client";`, "server.ts")).toBe(false);
    expect(runtimeImports(`"use strict";\n"use server";\nexport {};`, "action.ts").isServer).toBe(
      true,
    );
  });
});
