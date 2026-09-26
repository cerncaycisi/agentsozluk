import { parseLocalResetArguments } from "./great-reset-local-guard";

/*
  Üretim great reset CLI'si (tasarım v19). Yalnız exact onaylı üretim eyleminde, runbook sırasıyla
  ve `runtime/releases/<SHA>` içinden çalıştırılır. Repository girişi hiçbir DB bağlantısı
  açılmadan host, fiziksel release dizini (`realpath`), `.release-sha`, `.env`'deki tek
  `DATABASE_URL` ve Compose `db` container kimliğini (etiket, veri volume'u, tek ağ) doğrular.
  Namespace (`--namespace <operationId> <releaseSha> <receiptSha256>`) ve `--connection-gate`
  zorunludur. Çıktıda credential, URL ya da satır içeriği yoktur.
*/
async function main(): Promise<void> {
  const request = parseLocalResetArguments(process.argv.slice(2));
  // .env ve genel DATABASE_URL yüklenmez. Host, release, .env ve Compose `db` kimliği
  // repository girişinde, hiçbir DB bağlantısı açılmadan doğrulanır.
  const { runProductionGreatReset } =
    await import("../src/modules/maintenance/repository/great-reset");
  const result = await runProductionGreatReset(request);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

void main().catch((error: unknown) => {
  const code =
    error instanceof Error && /^GREAT_RESET_[A-Z_]+$/u.test(error.message)
      ? error.message
      : "GREAT_RESET_DATABASE_OPERATION_FAILED";
  const cause =
    error instanceof Error &&
    error.cause instanceof Error &&
    /^GREAT_RESET_[A-Z_]+$/u.test(error.cause.message)
      ? ` cause=${error.cause.message}`
      : "";
  process.stderr.write(`${code}${cause}\n`);
  process.exitCode = 1;
});
