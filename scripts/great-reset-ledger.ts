import { closeSync, constants, lstatSync, openSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import {
  alreadyRecorded,
  appendRecord,
  ledgerRestoreBlockers,
  ledgerStates,
  parseLedger,
  serializeRecord,
  type LedgerState,
} from "../src/modules/maintenance/domain/great-reset-ledger";
import { replaceDurable, syncExisting } from "./great-reset-durable-file";

/*
  Great reset dış nesil kaydının operatör sunucusu yazıcısı (tasarım v20 madde 4). Kayıt, üretim
  DB'si ve yedek dizini dışında, yalnız bu kullanıcının erişebildiği (dizin 0700, dosya 0600) tek
  dosyadır. Yazım: aynı dizinde O_EXCL geçici dosya → tam içerik → fsync → rename → dizin fsync →
  geri okuyup bayt eşitliği ve tam zincir doğrulaması. Eşzamanlı yazıcıyı O_EXCL kilit dosyası
  dışlar; kalmış kilit otomatik silinmez (operatör durumu inceler).

  great-reset-ledger.ts --file <yol> show
  great-reset-ledger.ts --file <yol> append <state> <operationId> <releaseSha> <dumpSha256> <receiptSha256|->
  great-reset-ledger.ts --file <yol> restore-check <operationId> <dumpSha256> <receiptSha256>
  great-reset-ledger.ts --file <yol> latest <operationId>
*/

function fail(code: string): never {
  throw new Error(`GREAT_RESET_LEDGER_${code}`);
}

function assertPrivate(path: string, kind: "file" | "directory"): void {
  const stat = lstatSync(path);
  if (kind === "file" ? !stat.isFile() : !stat.isDirectory()) fail("PATH_TYPE_INVALID");
  if (stat.uid !== process.getuid?.()) fail("PATH_OWNER_INVALID");
  if ((stat.mode & 0o077) !== 0) fail("PATH_MODE_INVALID");
}

function readLedger(file: string): string {
  try {
    assertPrivate(file, "file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
  return readFileSync(file, "utf8");
}

function durableReplace(file: string, content: string, previous: string): void {
  // Tam yazım, geçici dosya doğrulaması ve rename sonrası geri okuma (Astra, PR #238 P1).
  replaceDurable(file, join(dirname(file), `.great-reset-ledger.${process.pid}.tmp`), content);
  const reread = readFileSync(file, "utf8");
  if (reread !== content || !reread.startsWith(previous)) fail("READBACK_MISMATCH");
  parseLedger(reread);
}

function withLock<T>(file: string, work: () => T): T {
  const lock = `${file}.lock`;
  let handle: number;
  try {
    handle = openSync(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  } catch {
    fail("LOCKED");
  }
  closeSync(handle);
  try {
    return work();
  } finally {
    unlinkSync(lock);
  }
}

function main(argv: readonly string[]): string {
  if (argv[0] !== "--file" || !argv[1] || !isAbsolute(argv[1])) fail("ARGUMENTS_INVALID");
  const file = argv[1];
  assertPrivate(dirname(file), "directory");
  const [command, ...rest] = argv.slice(2);
  if (command === "show" && rest.length === 0) {
    const view = parseLedger(readLedger(file));
    return JSON.stringify({
      records: view.records.length,
      lastSha256: view.lastSha256,
      operations: Object.fromEntries([...view.latest].map(([id, record]) => [id, record.state])),
    });
  }
  if (command === "append" && rest.length === 5) {
    const [state, operationId, releaseSha, dumpSha256, receipt] = rest as [
      string,
      string,
      string,
      string,
      string,
    ];
    if (!ledgerStates.includes(state as LedgerState)) fail("STATE_INVALID");
    return withLock(file, () => {
      const previous = readLedger(file);
      const next = {
        state: state as LedgerState,
        operationId,
        releaseSha,
        dumpSha256,
        dumpClass: "RESET_MOMENT" as const,
        postResetReceiptSha256: receipt === "-" ? null : receipt,
      };
      const view = parseLedger(previous);
      if (alreadyRecorded(view, next)) {
        // Önceki yazım rename sonrası düşmüş olabilir: başarıdan önce kalıcılığı yeniden sağla.
        syncExisting(file);
        return JSON.stringify({
          appended: false,
          alreadyRecorded: state,
          seq: view.records.length,
          lastSha256: view.lastSha256,
        });
      }
      const updated = appendRecord(previous, next, new Date());
      durableReplace(file, updated, previous);
      const after = parseLedger(updated);
      return JSON.stringify({
        appended: state,
        seq: after.records.length,
        lastSha256: after.lastSha256,
      });
    });
  }
  if (command === "latest" && rest.length === 1) {
    // Operasyonun son kaydı (geri dönüş öncesi sarmalayıcı denetimi için).
    const record = parseLedger(readLedger(file)).latest.get(rest[0]!);
    if (!record) fail("OPERATION_MISSING");
    return serializeRecord(record);
  }
  if (command === "restore-check" && rest.length === 3) {
    const [operationId, dumpSha256, receipt] = rest as [string, string, string];
    const blockers = ledgerRestoreBlockers(
      parseLedger(readLedger(file)),
      operationId,
      dumpSha256,
      receipt,
    );
    if (blockers.length) {
      process.exitCode = 3;
      return JSON.stringify({ eligible: false, blockers });
    }
    return JSON.stringify({ eligible: true });
  }
  fail("ARGUMENTS_INVALID");
}

try {
  process.stdout.write(`${main(process.argv.slice(2))}\n`);
} catch (error) {
  const code =
    error instanceof Error && /^GREAT_RESET_LEDGER_[A-Z_]+$/u.test(error.message)
      ? error.message
      : "GREAT_RESET_LEDGER_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
