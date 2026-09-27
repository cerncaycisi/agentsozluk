/*
  Kullanım: DATABASE_URL=... tsx scripts/style-lab/fresh.ts <başlıklar.json> <çıktı.jsonl> <blok> [örnek=1]
  Haber/algı bağlamı olmadan, yalnız persona + kayıt rehberiyle verilen başlıklara entry yazdırır
  (içerik seçimi mi, ses mi ayrımı için teşhis). Persona'lar yerel DB'deki aktif ajanlardan sırayla.
*/
import { appendFile, readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { callCodex, validatorIssues } from "./lib";
import { registerBlock, registerBlock2, registerBlock3, registerBlock4 } from "./variants";

async function main() {
  const [titlesPath, outPath, blockName, examplesArg, candidatesArg] = process.argv.slice(2);
  const candidates = Number(candidatesArg ?? 1);
  const block = { r1: registerBlock, r2: registerBlock2, r3: registerBlock3, r4: registerBlock4 }[
    blockName ?? "r3"
  ]!;
  const titles = JSON.parse(await readFile(titlesPath!, "utf8")) as string[];
  const db = new PrismaClient({ log: [] });
  const personas = await db.agentPersonaVersion.findMany({
    where: { currentForProfile: { lifecycleStatus: "ACTIVE" } },
    select: { renderedPrompt: true },
    orderBy: { id: "asc" },
  });
  const examples =
    examplesArg !== "0" && process.env.STYLE_EXAMPLES
      ? (
          JSON.parse(await readFile(process.env.STYLE_EXAMPLES, "utf8")) as {
            title: string;
            text: string;
          }[]
        )
          .slice(0, 12)
          .map((item) => `- ${item.title}: ${item.text.replace(/\s+/gu, " ")}`)
      : [];
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["body"],
    properties: { body: { type: "string", minLength: 1, maxLength: 3000 } },
  };
  const queue = titles.map((title, index) => ({ title, index }));
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const persona = personas[job.index % personas.length]!.renderedPrompt.split(
        "\n# Agent Sözlük Anayasası",
      )[0];
      const prompt = [
        persona,
        "",
        block,
        ...(examples.length
          ? [
              "",
              "# Ton örnekleri (gerçek sözlük entry'leri)",
              "Yalnız ton için bak; içerik ve cümle kopyalama.",
              ...examples,
            ]
          : []),
        "",
        "# Görev",
        `Bu başlığa sözlükte bir entry yaz: ${job.title}`,
        "Yalnız emin olduğun bilgiyi kullan. Yalnız entry metnini body alanına yaz.",
      ].join("\n");
      try {
        const bodies: string[] = [];
        for (let k = 0; k < candidates; k += 1) {
          const { output } = await callCodex(`${prompt}\n(aday ${k + 1})`, schema, {
            effort: "low",
          });
          bodies.push(String((output as { body?: unknown }).body ?? "").trim());
        }
        let body = bodies[0]!;
        let scores: number[] = [];
        if (bodies.length > 1) {
          // Seçici: üretim modeli eleştirmen; en az "yapay" görünen aday (Astra bağımsız hakem kalır).
          const criticSchema = {
            type: "object",
            additionalProperties: false,
            required: ["scores"],
            properties: {
              scores: {
                type: "array",
                items: { type: "integer", minimum: 1, maximum: 10 },
                minItems: bodies.length,
                maxItems: bodies.length,
              },
            },
          };
          const critic = [
            "Aşağıdaki aday metinler bir sözlük başlığı için yazıldı. Her birini, bir sözlük okurunun gözüyle ne kadar yapay zekâ yazmış gibi durduğuna göre 1 (tamamen insan gibi) ile 10 (belli ki yapay zekâ) arasında puanla. Cilalı, zekice, dengeli, hazır espri ya da benzetmeli, 'tanım + yorum' kalıbında metinler yapaydır; pürüzlü, dağınık, özgül ve toparlanmamış metinler insana yakındır.",
            `başlık: ${job.title}`,
            ...bodies.map((b, i) => `### aday ${i + 1}\n${b}`),
          ].join("\n\n");
          const { output } = await callCodex(critic, criticSchema, { effort: "low" });
          scores = ((output as { scores?: number[] }).scores ?? []).map(Number);
          const best = scores.indexOf(Math.min(...scores));
          body = bodies[best >= 0 ? best : 0]!;
        }
        await appendFile(
          outPath!,
          `${JSON.stringify({ runId: `fresh-${job.index}`, candidates: bodies, scores, entries: [{ title: job.title, body, issues: validatorIssues(body, "MODEL_KNOWLEDGE") }] })}\n`,
        );
        process.stdout.write(`${job.title}\n`);
      } catch (error) {
        process.stdout.write(`${job.title} HATA ${String(error).slice(0, 120)}\n`);
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  await db.$disconnect();
}

void main();
