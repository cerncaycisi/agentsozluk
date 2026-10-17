import "./operator-cli-stderr-logs";
import "dotenv/config";
import { performance } from "node:perf_hooks";
import { getDatabase } from "@/lib/db/client";
import { computeRelatedTopicLinks } from "@/modules/topics/application/related-topics";

/*
  İlgili başlıklar (Gökhan kararı, 17 Ekim 2026: "Yalnız emin olunanlar"). Her başlık için en
  çok üç yüksek güvenli ilgili başlık hesaplar: yazarın kendi bkz'si ∪ (başlık benzerliği ilk 3 ∩
  içerik benzerliği ilk 3). Kural ve ölçüm `src/modules/topics/domain/related-topics.ts`'te.

    node node_modules/tsx/dist/cli.mjs scripts/ilgili-basliklar.ts              # yalnız hesaplar
    node node_modules/tsx/dist/cli.mjs scripts/ilgili-basliklar.ts --ornek=10   # + 10 örnek
    node node_modules/tsx/dist/cli.mjs scripts/ilgili-basliklar.ts --uygula     # tabloyu yazar (gece)

  Çıktı tek JSON satırı (sayılar ve süre). `--ornek=N` yalnız operatör içindir: N kaynak başlığı
  ve bağlantılarını ad olarak basar; başlık adları zaten herkese açık. `--uygula` tabloyu tek
  transaction'da siler ve yeniden yazar; hata olursa önceki küme kalır. Hata `ILGILI_FAILED
  code=…` ile ve 1 çıkış koduyla biter.
*/

function sampleCount(): number {
  const value = process.argv.find((argument) => argument.startsWith("--ornek="));
  if (!value) return 0;
  const count = Number(value.slice("--ornek=".length));
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw Object.assign(new Error("invalid sample count"), { code: "VALIDATION_ERROR" });
  return count;
}

async function main() {
  const apply = process.argv.includes("--uygula");
  const ornek = sampleCount();
  const started = performance.now();
  const result = await computeRelatedTopicLinks(getDatabase(), { apply, now: new Date() });
  const durationMs = Math.round(performance.now() - started);
  const samples = [...result.plans].slice(0, ornek).map(([topicId, links]) => ({
    baslik: result.titles.get(topicId) ?? null,
    ilgili: links.map((link) => ({
      baslik: result.titles.get(link.relatedTopicId) ?? null,
      kaynak: link.source,
    })),
  }));
  process.stdout.write(
    `${JSON.stringify({
      mode: apply ? "uygula" : "liste",
      ...result.summary,
      ...(apply ? { written: result.written } : {}),
      durationMs,
      ...(ornek > 0 ? { ornek: samples } : {}),
    })}\n`,
  );
}

main()
  .catch((error: unknown) => {
    const code =
      error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : "INTERNAL_ERROR";
    process.stderr.write(`ILGILI_FAILED code=${code}\n`);
    process.exitCode = 1;
  })
  .finally(() => void getDatabase().$disconnect());
