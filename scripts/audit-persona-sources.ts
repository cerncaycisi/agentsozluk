import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { SafeSourceReader, classifySourceReadError } from "../src/runtime/source-reader";
import {
  reviewedSourceLocaleFocus,
  sourceLocaleFocusValues,
  type SourceLocaleFocus,
} from "../src/modules/agents/personas/source-locale-metadata";
import { summarizeSourceAudit, type SourceAuditResult } from "./source-audit-report";

interface PersonaSource {
  url: string;
}

interface PersonaRecord {
  sources?: PersonaSource[];
}

interface SourceAuditTarget {
  url: string;
  localeFocus: SourceLocaleFocus;
}

const localeFocusSet = new Set<SourceLocaleFocus>(sourceLocaleFocusValues);

function personaRecords(value: unknown): PersonaRecord[] {
  if (Array.isArray(value)) return value as PersonaRecord[];
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const nested = record.personas ?? record.agents;
    if (Array.isArray(nested)) return nested as PersonaRecord[];
  }
  throw new Error("PERSONA_SOURCE_FORMAT_UNSUPPORTED");
}

async function configuredSourceTargets(): Promise<SourceAuditTarget[]> {
  const personaPath = resolve(process.cwd(), "src/modules/agents/personas/original-personas.json");
  const payload = JSON.parse(await readFile(personaPath, "utf8")) as unknown;
  return [
    ...new Set(
      personaRecords(payload)
        .flatMap((persona) => persona.sources ?? [])
        .map(({ url }) => url),
    ),
  ]
    .sort()
    .map((url) => ({ url, localeFocus: reviewedSourceLocaleFocus(url) }));
}

function sourceAuditTargets(value: unknown): SourceAuditTarget[] {
  if (!Array.isArray(value)) throw new Error("SOURCE_AUDIT_TARGETS_INVALID");
  const targets = value.map((target) => {
    if (typeof target === "string") return { url: target, localeFocus: "GLOBAL" as const };
    if (!target || typeof target !== "object") throw new Error("SOURCE_AUDIT_TARGETS_INVALID");
    const record = target as Record<string, unknown>;
    if (
      typeof record.url !== "string" ||
      typeof record.localeFocus !== "string" ||
      !localeFocusSet.has(record.localeFocus as SourceLocaleFocus)
    )
      throw new Error("SOURCE_AUDIT_TARGETS_INVALID");
    return {
      url: record.url,
      localeFocus: record.localeFocus as SourceLocaleFocus,
    };
  });
  const byUrl = new Map<string, SourceAuditTarget>();
  for (const target of targets) {
    if (byUrl.has(target.url)) throw new Error("SOURCE_AUDIT_TARGET_URL_DUPLICATE");
    new URL(target.url);
    byUrl.set(target.url, target);
  }
  return [...byUrl.values()].sort((left, right) => left.url.localeCompare(right.url));
}

async function main() {
  const encodedTargets =
    process.env.SOURCE_AUDIT_TARGETS_BASE64 ?? process.env.SOURCE_AUDIT_URLS_BASE64;
  const environmentTargets = encodedTargets
    ? (JSON.parse(Buffer.from(encodedTargets, "base64").toString("utf8")) as unknown)
    : [];
  const explicitTargets = encodedTargets
    ? sourceAuditTargets(environmentTargets)
    : process.argv.slice(2);
  const targets =
    explicitTargets.length > 0
      ? typeof explicitTargets[0] === "string"
        ? sourceAuditTargets(explicitTargets)
        : (explicitTargets as SourceAuditTarget[])
      : await configuredSourceTargets();
  const reader = new SafeSourceReader();

  process.stdout.write(
    `${JSON.stringify({ event: "SOURCE_AUDIT_START", sourceCount: targets.length })}\n`,
  );
  const results: SourceAuditResult[] = [];
  for (const { url, localeFocus } of targets) {
    const startedAt = Date.now();
    try {
      const items = await reader.read(url);
      const result: SourceAuditResult = {
        url,
        localeFocus,
        status: items.length > 0 ? "USABLE" : "EMPTY",
        itemCount: items.length,
        durationMs: Date.now() - startedAt,
      };
      results.push(result);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch (error) {
      const result: SourceAuditResult = {
        url,
        localeFocus,
        status: "ERROR",
        itemCount: 0,
        errorCode: classifySourceReadError(error),
        durationMs: Date.now() - startedAt,
      };
      results.push(result);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  }
  process.stdout.write(
    `${JSON.stringify({ event: "SOURCE_AUDIT_END", ...summarizeSourceAudit(results) })}\n`,
  );
}

void main().catch(() => {
  process.stderr.write("SOURCE_AUDIT_FATAL\n");
  process.exitCode = 1;
});
