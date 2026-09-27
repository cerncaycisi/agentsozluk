/*
  Kullanım: DATABASE_URL=... tsx scripts/style-lab/replay.ts <runs.json> <variant> <out.jsonl> [eşzamanlılık]
  runs.json: yeniden oynatılacak koşu kimlikleri. Her koşu: bağlam → varyant talimatı → karar →
  entry'ler; çıktı satır başına JSON. Varyantlar variants.ts'te.
*/
import { appendFile, readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { buildRuntimePrompt, runtimeOutputJsonSchema } from "@/runtime/worker";
import { parseRuntimeDecisionOutput } from "@/runtime/output";
import { callCodex, extractEntries, loadContext } from "./lib";
import { variants } from "./variants";

async function main() {
  const [runsPath, variantName, outPath, concurrencyArg] = process.argv.slice(2);
  const variant = variants[variantName!];
  if (!variant) throw new Error(`varyant yok: ${variantName}`);
  const runIds = JSON.parse(await readFile(runsPath!, "utf8")) as string[];
  const done = new Set(
    (await readFile(outPath!, "utf8").catch(() => ""))
      .split("\n")
      .filter(Boolean)
      .map((line) => (JSON.parse(line) as { runId: string }).runId),
  );
  const db = new PrismaClient({ log: [] });
  const queue = runIds.filter((id) => !done.has(id));
  const worker = async () => {
    for (let runId = queue.shift(); runId; runId = queue.shift()) {
      try {
        const context = await loadContext(db, runId);
        const prompt = variant.prompt(buildRuntimePrompt(context), context);
        const { output, ms } = await callCodex(
          prompt,
          runtimeOutputJsonSchema(context),
          variant.call,
        );
        const parsed = parseRuntimeDecisionOutput(output);
        const actionTypes = parsed.success ? parsed.data.actions.map((a) => a.actionType) : [];
        const parseIssues = parsed.success
          ? []
          : (parsed.error.issues ?? []).slice(0, 5).map((i) => `${i.path.join(".")}:${i.message}`);
        let entries = extractEntries(context, output);
        if (variant.post) entries = await variant.post(entries, context);
        await appendFile(
          outPath!,
          `${JSON.stringify({ runId, variant: variantName, ms, parsed: parsed.success, actionTypes, parseIssues, entries, output })}\n`,
        );
        process.stdout.write(`${runId} ${ms}ms entry=${entries.length}\n`);
      } catch (error) {
        await appendFile(
          outPath!,
          `${JSON.stringify({ runId, variant: variantName, error: String(error).slice(0, 500) })}\n`,
        );
        process.stdout.write(`${runId} HATA ${String(error).slice(0, 200)}\n`);
      }
    }
  };
  await Promise.all(Array.from({ length: Number(concurrencyArg ?? 3) }, worker));
  await db.$disconnect();
}

void main();
