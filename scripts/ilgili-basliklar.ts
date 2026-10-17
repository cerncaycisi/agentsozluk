import "./operator-cli-stderr-logs";
import "dotenv/config";
import { performance } from "node:perf_hooks";
import { getDatabase } from "@/lib/db/client";
import {
  computeRelatedTopicLinksWithRetry,
  relatedTopicExitCode,
} from "@/modules/topics/application/related-topics";

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

  Aynı anda tek hesap koşar (danışma kilidi, liste modu dahil). Kilit başka bir hesaptaysa:
  - liste modu beklemez; `{"status":"ALREADY_RUNNING"}` basar, çıkış kodu 0;
  - `--uygula` 60 sn arayla yeniden dener (Astra, 17 Ekim, 2. tur); kilit hâlâ alınamazsa
    `{"status":"ALREADY_RUNNING"}` basar ve 75 (EX_TEMPFAIL) ile çıkar, systemd birimi başarısız
    görünür.
  `--uygula` kilit devri çatışmasını da (serileştirme 40001/P2034 ya da `topic_related_links`
  benzersizliği 23505/P2002; Sol 6.1, 17 Ekim) bütün hesabı yeni snapshot'la yeniden deneyerek
  aşar. İki yeniden deneme türü aynı bütçeyi paylaşır: en çok 10 yeniden deneme, 60 sn ara,
  toplam 24 dk. Çatışma sürerse `{"status":"CONFLICT_RETRY_EXHAUSTED"}` basar ve 75 ile çıkar.
  Başarısız hiçbir denemede bir şey yazılmamıştır; önceki küme kalır.
  Başarılı hesapta `status` alanı `OK`'dir; gece yenilemesi yalnız `mode=uygula,status=OK` ile
  başarılı sayılır.
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
  const { result, attempts } = await computeRelatedTopicLinksWithRetry(getDatabase(), { apply });
  const durationMs = Math.round(performance.now() - started);
  if (result.status !== "OK") {
    // ALREADY_RUNNING ya da CONFLICT_RETRY_EXHAUSTED: hiçbir şey yazılmadı. Uygula modunda 75.
    process.stdout.write(
      `${JSON.stringify({ mode: apply ? "uygula" : "liste", status: result.status, attempts, durationMs })}\n`,
    );
    process.exitCode = relatedTopicExitCode(result, apply);
    return;
  }
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
      status: "OK",
      attempts,
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
