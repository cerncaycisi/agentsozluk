/*
  Kullanım: DATABASE_URL=... tsx scripts/style-lab/rewrite.ts <girdi.jsonl> <varyant> <çıktı.jsonl> [eşzamanlılık]
  Var olan karar çıktılarının entry'lerine yalnız varyantın `post` aşamasını uygular (kararlar
  yeniden üretilmez).
*/
import { appendFile, readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { loadContext, type LabEntry } from "./lib";
import { variants } from "./variants";

async function main() {
  const [inPath, variantName, outPath, concurrencyArg] = process.argv.slice(2);
  const variant = variants[variantName!];
  if (!variant?.post) throw new Error(`post aşaması olan varyant yok: ${variantName}`);
  const records = (await readFile(inPath!, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { runId: string; entries?: LabEntry[] })
    .filter((record) => record.entries?.length);
  const done = new Set(
    (await readFile(outPath!, "utf8").catch(() => ""))
      .split("\n")
      .filter(Boolean)
      .map((line) => (JSON.parse(line) as { runId: string }).runId),
  );
  const queue = records.filter((record) => !done.has(record.runId));
  const db = new PrismaClient({ log: [] });
  const worker = async () => {
    for (let record = queue.shift(); record; record = queue.shift()) {
      const context = await loadContext(db, record.runId);
      const entries = await variant.post!(record.entries!, context);
      await appendFile(
        outPath!,
        `${JSON.stringify({ runId: record.runId, variant: variantName, entries })}\n`,
      );
      process.stdout.write(`${record.runId} entry=${entries.length}\n`);
    }
  };
  await Promise.all(Array.from({ length: Number(concurrencyArg ?? 3) }, worker));
  await db.$disconnect();
}

void main();
