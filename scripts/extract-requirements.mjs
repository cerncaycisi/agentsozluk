import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sourcePath = process.argv[2];

if (!sourcePath) {
  throw new Error("Kullanım: node scripts/extract-requirements.mjs <goal-source.txt>");
}

const source = await readFile(sourcePath, "utf8");
const lines = source.split(/\r?\n/u);
const requirements = [];
const seen = new Set();
const pattern = /\[([A-Z0-9-]+-\d{3})\]/gu;

for (const [index, line] of lines.entries()) {
  for (const match of line.matchAll(pattern)) {
    const id = match[1];
    if (!id) continue;
    if (seen.has(id)) throw new Error(`Duplicate requirement: ${id}`);
    seen.add(id);

    let summary = line.slice((match.index ?? 0) + match[0].length).trim();
    if (!summary) {
      summary =
        lines
          .slice(index + 1)
          .find((candidate) => candidate.trim().length > 0)
          ?.trim() ?? id;
    }

    requirements.push({ id, sourceLine: index + 1, summary });
  }
}

requirements.sort((left, right) => left.id.localeCompare(right.id, "en"));

const manifest = {
  source: "Milestone 1 goal supplied by the repository owner",
  generatedAt: "2026-07-16",
  count: requirements.length,
  requirements,
};

const requirementMarkdown = [
  "# Milestone 1 requirements",
  "",
  `This manifest contains all ${requirements.length} unique requirement IDs extracted from the owner-supplied goal.`,
  "",
  "| Requirement | Source line | Summary |",
  "| --- | ---: | --- |",
  ...requirements.map(
    ({ id, sourceLine, summary }) =>
      `| ${id} | ${sourceLine} | ${summary.replaceAll("|", "\\|")} |`,
  ),
  "",
].join("\n");

const traceabilityMarkdown = [
  "# Milestone 1 traceability",
  "",
  "A row can become PASS only after both implementation and the required verification exist.",
  "",
  "| Requirement | Implementation | Test or validation | Status |",
  "| --- | --- | --- | --- |",
  ...requirements.map(({ id }) => `| ${id} | Not implemented | Not verified | FAIL |`),
  "",
].join("\n");

await writeFile(path.resolve("docs/requirements.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.resolve("docs/M1_REQUIREMENTS.md"), requirementMarkdown);
await writeFile(path.resolve("docs/TRACEABILITY.md"), traceabilityMarkdown);

process.stdout.write(`Generated ${requirements.length} requirements.\n`);
