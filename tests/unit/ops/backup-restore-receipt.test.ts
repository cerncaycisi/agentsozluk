import { describe, expect, it } from "vitest";
import { compareBackupRestore } from "../../../scripts/backup-restore/receipt";

const metadata =
  "SNAPSHOT_OK\nDUMP_DONE\nserver_version|16.14\ntable|probe|1|-123\nsequence|probe_id_seq|5\nMETA_DONE\n";
const restored =
  "RESTORE_BEGIN\nserver_version|16.14\ntable|probe|1|-123\nseqsafe|probe_id_seq|ok\nRESTORE_DONE\n";

describe("O3 kapalı makbuz karşılaştırması", () => {
  it("sequence anlık değer eşliği yerine sonraki değerin güvenliğini kullanır", () => {
    expect(compareBackupRestore(metadata, restored)).toEqual({
      result: "O3_DATA_MATCH",
      scope: "public",
      serverVersion: "16.14",
      tables: 1,
      rows: "1",
      sequences: 1,
    });
  });
  it.each([
    restored.replace("RESTORE_DONE\n", ""),
    restored.replace("server_version|16.14", "server_version|16.14\nserver_version|16.14"),
    restored.replace("RESTORE_DONE", "table|probe|1|-123\nRESTORE_DONE"),
    restored.replace("RESTORE_DONE", "seqsafe|probe_id_seq|ok\nRESTORE_DONE"),
    restored.replace("RESTORE_DONE", "unknown|value\nRESTORE_DONE"),
    restored.replace("table|probe|1|-123\n", ""),
    restored.replace("table|probe|1|-123", "table|probe|-1|-123"),
    restored.replace("table|probe|1|-123", "table|probe|1|NaN"),
    restored.replace("RESTORE_BEGIN", "RESTORE_BEGIN\nRESTORE_BEGIN"),
  ])("eksik veya belirsiz çıktı başarı olamaz (%#)", (receipt) => {
    expect(() => compareBackupRestore(metadata, receipt)).toThrow("O3_RECEIPT_INVALID");
  });
  it("kaynak metadata işaretleri eksikse durur", () => {
    expect(() => compareBackupRestore(metadata.replace("DUMP_DONE\n", ""), restored)).toThrow(
      "O3_RECEIPT_INVALID",
    );
  });
  it("ham metadata uyarılarını ayıklayıp sessiz başarı vermez", () => {
    expect(() => compareBackupRestore(`WARN[0000] warning\n${metadata}`, restored)).toThrow(
      "O3_RECEIPT_INVALID",
    );
  });
  it("farklı PG sürümünden özeti karşılaştırmaz", () => {
    expect(() => compareBackupRestore(metadata, restored.replace("16.14", "16.15"))).toThrow(
      "O3_VERSION_MISMATCH",
    );
  });
  it.each([
    restored.replace("probe|1|-123", "probe|2|-123"),
    restored.replace("probe|1|-123", "probe|1|-124"),
    restored.replace("probe|1|-123", "renamed|1|-123"),
    restored.replace("RESTORE_DONE", "table|extra|0|0\nRESTORE_DONE"),
  ])("tüm tablo kümesi ve içeriği bire bir eşleşir (%#)", (receipt) => {
    expect(() => compareBackupRestore(metadata, receipt)).toThrow("O3_TABLE_MISMATCH");
  });
  it.each([
    restored.replace("seqsafe|probe_id_seq|ok\n", ""),
    restored.replace("|ok", "|bad"),
    restored.replace("RESTORE_DONE", "seqsafe|extra|ok\nRESTORE_DONE"),
  ])("atlanan, fazladan veya güvensiz sequence reddedilir (%#)", (receipt) => {
    expect(() => compareBackupRestore(metadata, receipt)).toThrow("O3_SEQUENCE_UNSAFE");
  });
  it("satır toplamını Number hassasiyetine düşürmez", () => {
    const large = "9007199254740993";
    expect(
      compareBackupRestore(
        metadata.replace("probe|1|", `probe|${large}|`),
        restored.replace("probe|1|", `probe|${large}|`),
      ).rows,
    ).toBe(large);
  });
});
