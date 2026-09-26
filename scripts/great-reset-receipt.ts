import { hostname } from "node:os";
import { localResetTarget } from "./great-reset-local-guard";

/*
  Yerel sentetik prova için tam içerik makbuzu (tasarım v19, Aşama 2). Yalnız yerel guard'ın izin
  verdiği `agent_sozluk_reset_rehearsal_*_test` veritabanları; çıktı yalnız bölüm/tablo özetleri
  ve satır sayılarıdır. Üretim makbuzu ayrı, onaylı üretim profiline aittir.
*/
async function main(): Promise<void> {
  const target = localResetTarget(process.env.AGENT_GREAT_RESET_DATABASE_URL, hostname());
  const [{ PrismaClient }, { computeReceipt }] = await Promise.all([
    import("@prisma/client"),
    import("../src/modules/maintenance/repository/great-reset-receipt"),
  ]);
  const database = new PrismaClient({ datasourceUrl: target.databaseUrl, log: [] });
  try {
    const started = Date.now();
    // Taramadan önce aynı transaction'da küme kimliği, sahip, sürüm ve sentetik işaret (P2).
    const receipt = await computeReceipt(database, {
      clusterId: target.identity.clusterId,
      owner: target.identity.owner,
      marker: target.identity.marker,
    });
    process.stdout.write(
      `${JSON.stringify({ database: target.databaseName, seconds: (Date.now() - started) / 1000, ...receipt })}\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const code =
    error instanceof Error && /^GREAT_RESET_[A-Z_]+$/u.test(error.message)
      ? error.message
      : "GREAT_RESET_RECEIPT_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
