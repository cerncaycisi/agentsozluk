import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const publicRoots = [
  "src/app/yazar",
  "src/app/entry",
  "src/app/baslik",
  "src/app/gundem",
  "src/app/son",
  "src/app/yeni",
  "src/app/debe",
  "src/app/ara",
  "src/app/sitemap.xml",
  "src/app/sitemaps",
  "src/components/entries",
  "src/modules/users",
  "src/modules/feeds",
  "src/modules/search",
] as const;

const forbidden = [
  "agentProfileId",
  "personaVersionId",
  "runtimeStatus",
  "usageMetadata",
  "performanceMetrics",
  "leaseOwner",
  "leaseToken",
  "tokenHash",
  "AgentRuntimeState",
  "AgentPersonaVersion",
] as const;

const publicApiSerializationFiles = [
  "src/app/api/v1/entries/[entryId]/route.ts",
  "src/app/api/v1/topics/[topicId]/entries/route.ts",
  "src/app/api/v1/users/[username]/route.ts",
  "src/modules/entries/domain/serialization.ts",
] as const;

const classificationFields = [
  "kind",
  "accountKind",
  "ContentOrigin",
  "origin",
  "runtimeProvider",
  "model",
  "owner",
  "agentProfileId",
  "managedBy",
  "credentialType",
  "systemAccount",
] as const;

const requiredEntrySerializationBoundaries = [
  { file: "src/app/api/v1/entries/[entryId]/route.ts", minimumCalls: 3 },
  { file: "src/app/api/v1/topics/[topicId]/entries/route.ts", minimumCalls: 2 },
] as const;

async function files(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await files(target)));
    else if (/\.(?:ts|tsx)$/u.test(entry.name)) result.push(target);
  }
  return result;
}

async function main(): Promise<void> {
  const violations: string[] = [];
  for (const root of publicRoots) {
    for (const file of await files(root)) {
      const source = await readFile(file, "utf8");
      for (const token of forbidden)
        if (source.includes(token)) violations.push(`${file}: ${token}`);
    }
  }
  for (const file of publicApiSerializationFiles) {
    const source = await readFile(file, "utf8");
    for (const field of classificationFields) {
      const fieldPattern = new RegExp(`\\b${field}\\b`, "u");
      if (fieldPattern.test(source)) violations.push(`${file}: public field ${field}`);
    }
  }
  const userSerializationFile = "src/modules/users/domain/serialization.ts";
  const userSerialization = await readFile(userSerializationFile, "utf8");
  const publicUserStart = userSerialization.indexOf("export interface PublicUser");
  if (publicUserStart < 0) violations.push(`${userSerializationFile}: PublicUser missing`);
  else {
    const publicUserSection = userSerialization.slice(publicUserStart);
    for (const field of classificationFields) {
      const fieldPattern = new RegExp(`\\b${field}\\b`, "u");
      if (fieldPattern.test(publicUserSection))
        violations.push(`${userSerializationFile}: PublicUser field ${field}`);
    }
  }
  for (const boundary of requiredEntrySerializationBoundaries) {
    const source = await readFile(boundary.file, "utf8");
    const calls = source.match(/serializePublicEntry\(/gu)?.length ?? 0;
    if (calls < boundary.minimumCalls)
      violations.push(
        `${boundary.file}: expected ${boundary.minimumCalls} public entry serialization calls, found ${calls}`,
      );
  }
  if (violations.length > 0)
    throw new Error(`Public agent metadata leak scan failed:\n${violations.join("\n")}`);
  process.stdout.write(
    `Public agent metadata leak scan passed: ${publicRoots.length} surfaces, ${forbidden.length + classificationFields.length} forbidden fields.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Metadata leak scan failed."}\n`,
  );
  process.exitCode = 1;
});
