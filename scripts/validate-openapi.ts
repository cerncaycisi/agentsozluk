import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";

const methods = ["get", "post", "put", "patch", "delete"] as const;
type Method = (typeof methods)[number];

interface OpenApiOperation {
  operationId?: string;
  responses?: Record<string, unknown>;
}

interface OpenApiDocument {
  openapi?: string;
  paths?: Record<string, Partial<Record<Method, OpenApiOperation>>>;
}

async function routeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return routeFiles(target);
      return entry.name === "route.ts" ? [target] : [];
    }),
  );
  return nested.flat();
}

function operationKey(method: string, routePath: string): string {
  return `${method.toUpperCase()} ${routePath}`;
}

async function runtimeOperations(): Promise<Set<string>> {
  const root = path.join(process.cwd(), "src/app/api/v1");
  const operations = new Set<string>();
  for (const file of await routeFiles(root)) {
    const source = await readFile(file, "utf8");
    const routePath = `/${path
      .relative(path.join(process.cwd(), "src/app"), path.dirname(file))
      .split(path.sep)
      .map((part) => part.replace(/^\[([^\]]+)\]$/u, "{$1}"))
      .join("/")}`;
    const matcher = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/gu;
    for (const match of source.matchAll(matcher))
      operations.add(operationKey(match[1]!, routePath));
  }
  return operations;
}

async function main(): Promise<void> {
  const specificationPath = path.join(process.cwd(), "docs/openapi.yaml");
  const document = (await SwaggerParser.validate(specificationPath)) as OpenApiDocument;
  if (document.openapi !== "3.1.0") throw new Error("OpenAPI version must be exactly 3.1.0");

  const documented = new Set<string>();
  for (const [routePath, pathItem] of Object.entries(document.paths ?? {})) {
    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;
      documented.add(operationKey(method, routePath));
      if (!operation.operationId)
        throw new Error(`${method.toUpperCase()} ${routePath} has no operationId`);
      const responseCodes = Object.keys(operation.responses ?? {});
      if (!responseCodes.some((code) => /^2\d\d$/u.test(code))) {
        throw new Error(`${method.toUpperCase()} ${routePath} has no successful response`);
      }
    }
  }

  const runtime = await runtimeOperations();
  const missing = [...runtime].filter((operation) => !documented.has(operation)).sort();
  const stale = [...documented].filter((operation) => !runtime.has(operation)).sort();
  if (missing.length || stale.length) {
    throw new Error(
      [
        missing.length ? `Missing from OpenAPI:\n${missing.join("\n")}` : "",
        stale.length ? `Not implemented by runtime:\n${stale.join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  process.stdout.write(
    `OpenAPI 3.1 validation passed: ${documented.size} runtime operations aligned.\n`,
  );
}

void main();
