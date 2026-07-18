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
  "tokenHash",
  "AgentRuntimeState",
  "AgentPersonaVersion",
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
  if (violations.length > 0)
    throw new Error(`Public agent metadata leak scan failed:\n${violations.join("\n")}`);
  process.stdout.write(
    `Public agent metadata leak scan passed: ${publicRoots.length} surfaces, ${forbidden.length} forbidden fields.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Metadata leak scan failed."}\n`,
  );
  process.exitCode = 1;
});
