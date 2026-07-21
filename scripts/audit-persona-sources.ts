import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { SafeSourceReader, classifySourceReadError } from "../src/runtime/source-reader";

interface PersonaSource {
  url: string;
}

interface PersonaRecord {
  sources?: PersonaSource[];
}

function personaRecords(value: unknown): PersonaRecord[] {
  if (Array.isArray(value)) return value as PersonaRecord[];
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const nested = record.personas ?? record.agents;
    if (Array.isArray(nested)) return nested as PersonaRecord[];
  }
  throw new Error("PERSONA_SOURCE_FORMAT_UNSUPPORTED");
}

const environmentUrls = process.env.SOURCE_AUDIT_URLS_BASE64
  ? (JSON.parse(
      Buffer.from(process.env.SOURCE_AUDIT_URLS_BASE64, "base64").toString("utf8"),
    ) as unknown)
  : [];
if (!Array.isArray(environmentUrls) || environmentUrls.some((url) => typeof url !== "string"))
  throw new Error("SOURCE_AUDIT_URLS_INVALID");
const explicitUrls = environmentUrls.length ? (environmentUrls as string[]) : process.argv.slice(2);
const urls = explicitUrls.length
  ? [...new Set(explicitUrls)].sort()
  : await (async () => {
      const personaPath = resolve(
        process.cwd(),
        "src/modules/agents/personas/original-personas.json",
      );
      const payload = JSON.parse(await readFile(personaPath, "utf8")) as unknown;
      return [
        ...new Set(
          personaRecords(payload)
            .flatMap((persona) => persona.sources ?? [])
            .map(({ url }) => url),
        ),
      ].sort();
    })();
const reader = new SafeSourceReader({ minimumDomainIntervalMs: 0 });

process.stdout.write(
  `${JSON.stringify({ event: "SOURCE_AUDIT_START", sourceCount: urls.length })}\n`,
);
for (const url of urls) {
  const startedAt = Date.now();
  try {
    const items = await reader.read(url);
    process.stdout.write(
      `${JSON.stringify({
        url,
        status: items.length > 0 ? "USABLE" : "EMPTY",
        itemCount: items.length,
        durationMs: Date.now() - startedAt,
      })}\n`,
    );
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        url,
        status: "ERROR",
        errorCode: classifySourceReadError(error),
        durationMs: Date.now() - startedAt,
      })}\n`,
    );
  }
}
process.stdout.write(`${JSON.stringify({ event: "SOURCE_AUDIT_END" })}\n`);
