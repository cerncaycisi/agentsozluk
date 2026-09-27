import { describe, expect, it } from "vitest";
import {
  alreadyRecorded,
  appendRecord,
  ledgerRestoreBlockers,
  parseLedger,
  serializeRecord,
  sha256Hex,
  type LedgerAppend,
} from "../../../src/modules/maintenance/domain/great-reset-ledger";

const operationId = "11111111-2222-4333-8444-555555555555";
const other = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const releaseSha = "a".repeat(40);
const dumpSha256 = "b".repeat(64);
const receipt = "c".repeat(64);

function step(state: LedgerAppend["state"], id = operationId): LedgerAppend {
  const receiptValue = state === "PREPARED" || state === "ABORTED" ? null : receipt;
  return {
    state,
    operationId: id,
    releaseSha,
    dumpSha256,
    dumpClass: "RESET_MOMENT",
    postResetReceiptSha256: receiptValue,
  };
}

function chain(...states: LedgerAppend[]): string {
  let content = "";
  let minute = 0;
  for (const next of states)
    content = appendRecord(content, next, new Date(Date.UTC(2026, 8, 28, 17, minute++)));
  return content;
}

describe("great reset dış nesil kaydı", () => {
  it("izinli yolu zincirler; her satır önceki satırın özetini taşır", () => {
    const content = chain(step("PREPARED"), step("COMMITTED_MAINTENANCE"), step("TRAFFIC_OPEN"));
    const view = parseLedger(content);
    expect(view.records.map((record) => record.seq)).toEqual([1, 2, 3]);
    const lines = content.split("\n");
    expect(view.records[0]!.prevSha256).toBe("0".repeat(64));
    expect(view.records[1]!.prevSha256).toBe(sha256Hex(`${lines[0]}\n`));
    expect(view.latest.get(operationId)?.state).toBe("TRAFFIC_OPEN");
  });

  it("yeni içerik eski içeriğin birebir önekidir", () => {
    const first = chain(step("PREPARED"));
    const second = appendRecord(
      first,
      step("COMMITTED_MAINTENANCE"),
      new Date("2026-09-28T18:00:00.000Z"),
    );
    expect(second.startsWith(first)).toBe(true);
  });

  it("son durumlardan ve izinsiz geçişlerden sonra yazmaz", () => {
    const opened = chain(step("PREPARED"), step("COMMITTED_MAINTENANCE"), step("TRAFFIC_OPEN"));
    expect(() =>
      appendRecord(opened, step("ROLLED_BACK"), new Date("2026-09-28T19:00:00.000Z")),
    ).toThrow("GREAT_RESET_LEDGER_TRANSITION_FORBIDDEN");
    const prepared = chain(step("PREPARED"));
    expect(() =>
      appendRecord(prepared, step("TRAFFIC_OPEN"), new Date("2026-09-28T19:00:00.000Z")),
    ).toThrow("GREAT_RESET_LEDGER_TRANSITION_FORBIDDEN");
    expect(() => chain(step("COMMITTED_MAINTENANCE"))).toThrow(
      "GREAT_RESET_LEDGER_FIRST_STATE_NOT_PREPARED",
    );
  });

  it("commit görülmüş kayıtta ikinci reset, açık operasyon varken ikinci operasyon yazılmaz", () => {
    const rolledBack = chain(step("PREPARED"), step("COMMITTED_MAINTENANCE"), step("ROLLED_BACK"));
    expect(() =>
      appendRecord(rolledBack, step("PREPARED", other), new Date("2026-09-28T19:00:00.000Z")),
    ).toThrow("GREAT_RESET_LEDGER_SECOND_RESET_FORBIDDEN");
    const open = chain(step("PREPARED"));
    expect(() =>
      appendRecord(open, step("PREPARED", other), new Date("2026-09-28T19:00:00.000Z")),
    ).toThrow("GREAT_RESET_LEDGER_ANOTHER_OPERATION_OPEN");
    // Vazgeçilmiş (ABORTED) deneme yeni operasyonu engellemez.
    const aborted = chain(step("PREPARED"), step("ABORTED"));
    expect(() =>
      appendRecord(aborted, step("PREPARED", other), new Date("2026-09-28T19:00:00.000Z")),
    ).not.toThrow();
  });

  it("bozuk, kesik, yeniden sıralanmış veya kimliği değişen kaydı reddeder", () => {
    const content = chain(step("PREPARED"), step("COMMITTED_MAINTENANCE"));
    expect(() => parseLedger(content.slice(0, -1))).toThrow("GREAT_RESET_LEDGER_TRUNCATED");
    const [first = "", second = ""] = content.trimEnd().split("\n");
    expect(() => parseLedger(`${second}\n${first}\n`)).toThrow("GREAT_RESET_LEDGER_SEQ_GAP");
    // Zincirin doğal sınırı: SON satırın değişmesi sonraki bir satırı kırmaz. Son kaydın değerleri
    // restore kapısında DB'deki commit satırı ve reset sonrası makbuzla ayrıca eşlenir.
    expect(() => parseLedger(content.replace(receipt, "d".repeat(64)))).not.toThrow();
    // Satırın kendisi geçerli olsa da zincirde önceki satırı değiştirmek sonrakini kırar.
    expect(() =>
      parseLedger(
        content.replace('"at":"2026-09-28T17:00:00.000Z"', '"at":"2026-09-28T16:00:00.000Z"'),
      ),
    ).toThrow("GREAT_RESET_LEDGER_CHAIN_BROKEN");
    const record = parseLedger(`${first}\n`).records[0]!;
    const changed = serializeRecord({
      ...record,
      seq: 2,
      prevSha256: sha256Hex(`${first}\n`),
      state: "COMMITTED_MAINTENANCE",
      dumpSha256: "e".repeat(64),
      postResetReceiptSha256: receipt,
    });
    expect(() => parseLedger(`${first}\n${changed}\n`)).toThrow(
      "GREAT_RESET_LEDGER_IDENTITY_CHANGED",
    );
    expect(() => parseLedger(`${first.replace('"seq":1', '"seq": 1')}\n`)).toThrow(
      "GREAT_RESET_LEDGER_LINE_NOT_CANONICAL",
    );
  });

  it("restore koşulu yalnız COMMITTED_MAINTENANCE ve aynı dump/makbuzda boştur", () => {
    const committed = parseLedger(chain(step("PREPARED"), step("COMMITTED_MAINTENANCE")));
    expect(ledgerRestoreBlockers(committed, operationId, dumpSha256, receipt)).toEqual([]);
    expect(ledgerRestoreBlockers(committed, operationId, "f".repeat(64), receipt)).toContain(
      "LEDGER_DUMP_MISMATCH",
    );
    expect(ledgerRestoreBlockers(committed, operationId, dumpSha256, "f".repeat(64))).toContain(
      "LEDGER_RECEIPT_MISMATCH",
    );
    expect(ledgerRestoreBlockers(committed, other, dumpSha256, receipt)).toEqual([
      "LEDGER_OPERATION_MISSING",
    ]);
    const opened = parseLedger(
      chain(step("PREPARED"), step("COMMITTED_MAINTENANCE"), step("TRAFFIC_OPEN")),
    );
    expect(ledgerRestoreBlockers(opened, operationId, dumpSha256, receipt)).toEqual([
      "LEDGER_STATE_TRAFFIC_OPEN",
    ]);
    const prepared = parseLedger(chain(step("PREPARED")));
    expect(ledgerRestoreBlockers(prepared, operationId, dumpSha256, receipt)).toContain(
      "LEDGER_STATE_PREPARED",
    );
  });
  it("kayıp ack: aynı durum aynı alanlarla kayıtlıysa yeniden yazılmaz, çelişki durur", () => {
    const view = parseLedger(chain(step("PREPARED"), step("COMMITTED_MAINTENANCE")));
    expect(alreadyRecorded(view, step("COMMITTED_MAINTENANCE"))).toBe(true);
    expect(alreadyRecorded(view, step("TRAFFIC_OPEN"))).toBe(false);
    expect(() =>
      alreadyRecorded(view, { ...step("COMMITTED_MAINTENANCE"), dumpSha256: "e".repeat(64) }),
    ).toThrow("GREAT_RESET_LEDGER_RECORDED_STATE_CONFLICT");
    expect(alreadyRecorded(view, step("PREPARED", other))).toBe(false);
  });
});
