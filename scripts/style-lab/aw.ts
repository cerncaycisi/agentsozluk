/*
  Kullanım: DATABASE_URL=... tsx scripts/style-lab/aw.ts <replay.jsonl> <çıktı.jsonl> [eşzamanlılık]
  Saklanan karar çıktısı üzerinde worker'ın eylem değeri (AW) aşamasını çalıştırır; entry
  adaylarından kaçının kabul edildiğini kaydeder (sadeleşen entry'ler AW'de daha sık mı eleniyor?).
*/
import { appendFile, readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import {
  parseRuntimeActionWorthinessVerdict,
  runtimeActionWorthinessVerdictJsonSchema,
} from "@/runtime/action-worthiness";
import { parseRuntimeDecisionOutput } from "@/runtime/output";
import { buildActionWorthinessPrompt } from "@/runtime/worker";
import { callCodex, loadContext } from "./lib";

async function main() {
  const [inPath, outPath, concurrencyArg] = process.argv.slice(2);
  const records = (await readFile(inPath!, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { runId: string; output?: unknown })
    .filter((record) => record.output);
  const db = new PrismaClient({ log: [] });
  const queue = [...records];
  const worker = async () => {
    for (let record = queue.shift(); record; record = queue.shift()) {
      const parsed = parseRuntimeDecisionOutput(record.output);
      if (!parsed.success) continue;
      const decision = parsed.data;
      const candidates = decision.actions.filter(({ actionType }) => actionType !== "NO_ACTION");
      const entryCandidates = candidates.filter(({ actionType }) =>
        ["CREATE_ENTRY", "CREATE_TOPIC_WITH_ENTRY"].includes(actionType),
      );
      if (entryCandidates.length === 0) continue;
      const context = await loadContext(db, record.runId);
      try {
        const { output } = await callCodex(
          buildActionWorthinessPrompt(context, decision),
          runtimeActionWorthinessVerdictJsonSchema,
        );
        const verdict = parseRuntimeActionWorthinessVerdict(
          output,
          candidates.map(({ sequence }) => sequence),
        );
        const selected = new Set(verdict.verdict === "ACT" ? verdict.selectedSequences : []);
        const accepted = entryCandidates.filter(({ sequence }) => selected.has(sequence)).length;
        await appendFile(
          outPath!,
          `${JSON.stringify({ runId: record.runId, entryCandidates: entryCandidates.length, accepted })}\n`,
        );
        process.stdout.write(`${record.runId} ${accepted}/${entryCandidates.length}\n`);
      } catch (error) {
        process.stdout.write(`${record.runId} HATA ${String(error).slice(0, 160)}\n`);
      }
    }
  };
  await Promise.all(Array.from({ length: Number(concurrencyArg ?? 2) }, worker));
  await db.$disconnect();
}

void main();
