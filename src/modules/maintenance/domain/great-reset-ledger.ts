import { createHash } from "node:crypto";

/*
  Great reset dış nesil kaydı (tasarım v20 madde 4). Operatör sunucusunda, üretim DB'si ve yedek
  dizini dışında tutulan, yalnız eklenen JSON satırları. Her satır artan sıra numarası ve önceki
  satırın ham baytlarının SHA-256'sını taşır; ilk satırın önceki özeti 64 sıfırdır. HMAC yoktur:
  tehdit modeli kötü niyetli operatör değil operatör hatasıdır. Bu modül saf mantıktır; dosya
  yazımı (fsync/rename) `scripts/great-reset-ledger.ts` içindedir.

  Durumlar: PREPARED → COMMITTED_MAINTENANCE → TRAFFIC_OPEN | ROLLED_BACK; PREPARED → ABORTED.
  TRAFFIC_OPEN, ROLLED_BACK ve ABORTED son durumdur. Bir operasyon COMMITTED_MAINTENANCE'e
  ulaştıktan sonra yeni PREPARED yazılamaz: tasarım ikinci reseti (geri alınmış olsa da) yasaklar.

  Sınır: zincir önceki satırların değişmesini yakalar; SON satırın değişmesini yakalayamaz. Bu
  yüzden restore kapısı son kaydın değerlerini DB'deki commit satırı ve reset sonrası makbuzla
  ayrıca eşler; kayıt tek başına restore izni değildir.
*/

export const ledgerStates = [
  "PREPARED",
  "COMMITTED_MAINTENANCE",
  "TRAFFIC_OPEN",
  "ROLLED_BACK",
  "ABORTED",
] as const;
export type LedgerState = (typeof ledgerStates)[number];

export const dumpClasses = ["RESET_MOMENT"] as const;
export type DumpClass = (typeof dumpClasses)[number];

export type LedgerRecord = {
  seq: number;
  prevSha256: string;
  state: LedgerState;
  operationId: string;
  releaseSha: string;
  dumpSha256: string;
  dumpClass: DumpClass;
  /** Reset sonrası tam makbuzun özeti; COMMITTED_MAINTENANCE ve sonrasında zorunlu. */
  postResetReceiptSha256: string | null;
  at: string;
};

export type LedgerAppend = Omit<LedgerRecord, "seq" | "prevSha256" | "at">;

const zero = "0".repeat(64);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha40 = /^[a-f0-9]{40}$/u;
const sha64 = /^[a-f0-9]{64}$/u;

const transitions: Record<LedgerState, readonly LedgerState[]> = {
  PREPARED: ["COMMITTED_MAINTENANCE", "ABORTED"],
  COMMITTED_MAINTENANCE: ["TRAFFIC_OPEN", "ROLLED_BACK"],
  TRAFFIC_OPEN: [],
  ROLLED_BACK: [],
  ABORTED: [],
};

function fail(code: string): never {
  throw new Error(`GREAT_RESET_LEDGER_${code}`);
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Anahtar sırası sabit tek satır; ayrıştırılan satır aynı biçimde yeniden üretilebilmelidir. */
export function serializeRecord(record: LedgerRecord): string {
  return JSON.stringify({
    seq: record.seq,
    prevSha256: record.prevSha256,
    state: record.state,
    operationId: record.operationId,
    releaseSha: record.releaseSha,
    dumpSha256: record.dumpSha256,
    dumpClass: record.dumpClass,
    postResetReceiptSha256: record.postResetReceiptSha256,
    at: record.at,
  });
}

function assertRecordShape(record: LedgerRecord): void {
  if (!Number.isSafeInteger(record.seq) || record.seq < 1) fail("SEQ_INVALID");
  if (!sha64.test(record.prevSha256)) fail("PREV_INVALID");
  if (!ledgerStates.includes(record.state)) fail("STATE_INVALID");
  if (!uuid.test(record.operationId)) fail("OPERATION_INVALID");
  if (!sha40.test(record.releaseSha)) fail("RELEASE_INVALID");
  if (!sha64.test(record.dumpSha256)) fail("DUMP_INVALID");
  if (!dumpClasses.includes(record.dumpClass)) fail("DUMP_CLASS_INVALID");
  const needsReceipt = record.state !== "PREPARED" && record.state !== "ABORTED";
  if (
    needsReceipt
      ? !sha64.test(record.postResetReceiptSha256 ?? "")
      : record.postResetReceiptSha256 !== null
  )
    fail("RECEIPT_INVALID");
  if (Number.isNaN(Date.parse(record.at)) || new Date(record.at).toISOString() !== record.at)
    fail("TIME_INVALID");
}

export type LedgerView = {
  records: LedgerRecord[];
  lastSha256: string;
  /** Operasyon başına son durum ve o durumu yazan kayıt. */
  latest: Map<string, LedgerRecord>;
};

/**
 * Dosyanın tamamını doğrular: her satır tam biçimli, sıra 1'den kesintisiz, önceki özet zinciri
 * doğru, geçişler izinli, kimlik alanları operasyon boyunca sabit. Bozuk veya kısmen yazılmış dosya
 * reddedilir; eksik son satır sonu da bozukluktur.
 */
export function parseLedger(content: string): LedgerView {
  const latest = new Map<string, LedgerRecord>();
  const records: LedgerRecord[] = [];
  let previous = zero;
  if (content !== "" && !content.endsWith("\n")) fail("TRUNCATED");
  const lines = content === "" ? [] : content.slice(0, -1).split("\n");
  let committedOnce = false;
  for (const [index, line] of lines.entries()) {
    let record: LedgerRecord;
    try {
      record = JSON.parse(line) as LedgerRecord;
    } catch {
      fail("LINE_UNPARSEABLE");
    }
    assertRecordShape(record);
    if (serializeRecord(record) !== line) fail("LINE_NOT_CANONICAL");
    if (record.seq !== index + 1) fail("SEQ_GAP");
    if (record.prevSha256 !== previous) fail("CHAIN_BROKEN");
    if (index > 0 && Date.parse(record.at) < Date.parse(records[index - 1]!.at))
      fail("TIME_REGRESSED");
    const before = latest.get(record.operationId);
    if (!before) {
      if (record.state !== "PREPARED") fail("FIRST_STATE_NOT_PREPARED");
      if (committedOnce) fail("SECOND_RESET_FORBIDDEN");
      // Aynı anda tek açık operasyon.
      for (const other of latest.values())
        if (transitions[other.state].length > 0) fail("ANOTHER_OPERATION_OPEN");
    } else {
      if (!transitions[before.state].includes(record.state)) fail("TRANSITION_FORBIDDEN");
      if (
        before.releaseSha !== record.releaseSha ||
        before.dumpSha256 !== record.dumpSha256 ||
        before.dumpClass !== record.dumpClass
      )
        fail("IDENTITY_CHANGED");
      if (
        before.postResetReceiptSha256 !== null &&
        before.postResetReceiptSha256 !== record.postResetReceiptSha256
      )
        fail("RECEIPT_CHANGED");
    }
    if (record.state === "COMMITTED_MAINTENANCE") committedOnce = true;
    latest.set(record.operationId, record);
    records.push(record);
    previous = sha256Hex(`${line}\n`);
  }
  return { records, lastSha256: previous, latest };
}

/**
 * Yeni satırı üretir ve eski içerik + yeni satırın tamamının geçerli olduğunu doğrular. Dönen metin
 * eski içeriğin birebir önekidir; yazıcı yalnız bunu atomik olarak yerine koyar.
 */
export function appendRecord(content: string, next: LedgerAppend, now: Date): string {
  const view = parseLedger(content);
  const record: LedgerRecord = {
    seq: view.records.length + 1,
    prevSha256: view.lastSha256,
    state: next.state,
    operationId: next.operationId,
    releaseSha: next.releaseSha,
    dumpSha256: next.dumpSha256,
    dumpClass: next.dumpClass,
    postResetReceiptSha256: next.postResetReceiptSha256,
    at: now.toISOString(),
  };
  const updated = `${content}${serializeRecord(record)}\n`;
  parseLedger(updated);
  return updated;
}

/**
 * Kayıp `ack` uzlaşması (Astra, PR #238 2. tur P2): sarmalayıcı kaydı kalıcılaştırıp uzak `ack`
 * işlenmeden kesilirse aynı durum yeniden istenir. Operasyonun son kaydı aynı durumda ve exact
 * aynı kimlik alanlarıyla (release, dump, dump sınıfı, makbuz) zaten varsa `true` döner ve yeniden
 * yazılmaz. Aynı durum farklı alanlarla kayıtlıysa çelişkidir, durulur. Diğer her durumda `false`
 * (normal geçiş kuralları uygulanır).
 */
export function alreadyRecorded(view: LedgerView, next: LedgerAppend): boolean {
  const latest = view.latest.get(next.operationId);
  if (!latest || latest.state !== next.state) return false;
  if (
    latest.releaseSha !== next.releaseSha ||
    latest.dumpSha256 !== next.dumpSha256 ||
    latest.dumpClass !== next.dumpClass ||
    latest.postResetReceiptSha256 !== next.postResetReceiptSha256
  )
    fail("RECORDED_STATE_CONFLICT");
  return true;
}

/**
 * Restore kapısının dış kayıt koşulu: operasyonun son durumu COMMITTED_MAINTENANCE olmalı ve
 * dump SHA'sı ile reset sonrası makbuz özeti kayıtla birebir tutmalıdır. TRAFFIC_OPEN veya başka
 * her durum restore'u reddeder. DB tarafı koşullar ayrıca denetlenir.
 */
export function ledgerRestoreBlockers(
  view: LedgerView,
  operationId: string,
  dumpSha256: string,
  postResetReceiptSha256: string,
): string[] {
  const record = view.latest.get(operationId);
  const blockers: string[] = [];
  if (!record) return ["LEDGER_OPERATION_MISSING"];
  if (record.state !== "COMMITTED_MAINTENANCE") blockers.push(`LEDGER_STATE_${record.state}`);
  if (record.dumpSha256 !== dumpSha256) blockers.push("LEDGER_DUMP_MISMATCH");
  if (record.dumpClass !== "RESET_MOMENT") blockers.push("LEDGER_DUMP_CLASS_INVALID");
  if (record.postResetReceiptSha256 !== postResetReceiptSha256)
    blockers.push("LEDGER_RECEIPT_MISMATCH");
  return blockers;
}
