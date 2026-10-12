import "./operator-cli-stderr-logs";
import "dotenv/config";
import { getDatabase } from "@/lib/db/client";
import {
  DUPLICATE_SCAN_DEFAULTS,
  duplicateReportPlan,
  ensureKaragoz,
  fileDuplicateTopicReports,
  resolveKaragozActor,
  scanDuplicateTopics,
} from "@/modules/moderation/application/duplicate-topics";
import { resolveOperatorAdmin } from "./agent-operator";

/*
  Karagöz (Gökhan, 12 Ekim 2026). Yeni açılan başlıklarda eski bir başlığa çok benzeyenler
  için "kopya başlık" gammazı açar; karar rapor sayfasında tek tıkla verilir. Hiçbir şeyi
  birleştirmez.

    node node_modules/tsx/dist/cli.mjs scripts/karagoz.ts            # yalnız listeler
    node node_modules/tsx/dist/cli.mjs scripts/karagoz.ts --kur      # bir kez: hesabı kurar
    node node_modules/tsx/dist/cli.mjs scripts/karagoz.ts --uygula   # gammaz açar (günlük)

  Ayarlar: KOPYA_GUN (varsayılan 3), KOPYA_ESIK (0.8), KOPYA_SINIR (30). Gammazı karagöz hesabı açar; hesabı ilk kez kuran
  `resolveOperatorAdmin` (AGENT_OPERATOR_ADMIN_ID ya da tek aktif HUMAN ADMIN). Komut yetki
  değildir: üretimde gammaz açmak geçerli yetki ister.
*/
async function main() {
  const uygula = process.argv.includes("--uygula");
  if (process.argv.includes("--kur")) {
    // Bir kez: hesabı açar ve GAMMAZ yeteneğini operatör yönetici adına verir.
    const operator = await resolveOperatorAdmin(getDatabase(), process.env.AGENT_OPERATOR_ADMIN_ID);
    await ensureKaragoz(getDatabase(), operator);
    process.stdout.write(`${JSON.stringify({ mode: "kur", ok: true })}\n`);
    return;
  }
  const sayi = (ad: string, varsayilan: number) => {
    const deger = process.env[ad];
    return deger === undefined || deger === "" ? varsayilan : Number(deger);
  };
  const database = getDatabase();
  const pairs = await scanDuplicateTopics(database, {
    now: new Date(),
    days: sayi("KOPYA_GUN", DUPLICATE_SCAN_DEFAULTS.days),
    threshold: sayi("KOPYA_ESIK", DUPLICATE_SCAN_DEFAULTS.threshold),
    limit: sayi("KOPYA_SINIR", DUPLICATE_SCAN_DEFAULTS.limit),
  });
  const plan = pairs.map((pair) => ({
    ...duplicateReportPlan(pair),
    similarity: Number(pair.similarity.toFixed(2)),
  }));
  if (!uygula) {
    process.stdout.write(`${JSON.stringify({ mode: "liste", count: plan.length, plan })}\n`);
    return;
  }
  const actor = await resolveKaragozActor(database);
  const result = await fileDuplicateTopicReports(database, actor, pairs);
  process.stdout.write(
    `${JSON.stringify({ mode: "uygula", filed: result.filed.length, failed: result.failed })}\n`,
  );
}

main()
  .catch((error: unknown) => {
    const code =
      error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : "INTERNAL_ERROR";
    process.stderr.write(`KARAGOZ_FAILED code=${code}\n`);
    process.exitCode = 1;
  })
  .finally(() => void getDatabase().$disconnect());
