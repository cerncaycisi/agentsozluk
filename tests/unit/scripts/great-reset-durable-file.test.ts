import type * as fs from "node:fs";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
  Kısa yazım enjeksiyonu (Astra, PR #238 P1/P2): `writeSync` her çağrıda en çok birkaç bayt yazar
  ya da hiç yazamaz. Tam yazım döngüsü içeriği yine eksiksiz yazmalı; yazamıyorsa hedef dosya
  (dış kayıt) hiç değişmemeli, geçici dosya kalmamalı.
*/
const mode = vi.hoisted(() => ({ value: "normal" as "normal" | "chunked" | "stalled" }));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof fs>("node:fs");
  return {
    ...actual,
    writeSync: (handle: number, buffer: Buffer, offset = 0, length = buffer.length - offset) => {
      if (mode.value === "stalled") return 0;
      const size = mode.value === "chunked" ? Math.min(3, length) : length;
      return actual.writeSync(handle, buffer, offset, size);
    },
  };
});

const { replaceDurable, writeNewDurable } =
  await import("../../../scripts/great-reset-durable-file");

const directories: string[] = [];
function directory(): string {
  const created = mkdtempSync(join(tmpdir(), "great-reset-durable-"));
  chmodSync(created, 0o700);
  directories.push(created);
  return created;
}

afterEach(() => {
  mode.value = "normal";
  for (const created of directories.splice(0)) rmSync(created, { recursive: true, force: true });
});

describe("great reset dayanıklı dosya yazımı", () => {
  it("parça parça yazan writeSync ile de içeriği eksiksiz yazar", () => {
    const dir = directory();
    mode.value = "chunked";
    writeNewDurable(join(dir, "receipt.json"), '{"uzun":"makbuz içeriği ğüşıöç"}\n');
    replaceDurable(join(dir, "ledger.jsonl"), join(dir, ".tmp"), "satır-1\nsatır-2\n");
    expect(readFileSync(join(dir, "receipt.json"), "utf8")).toBe(
      '{"uzun":"makbuz içeriği ğüşıöç"}\n',
    );
    expect(readFileSync(join(dir, "ledger.jsonl"), "utf8")).toBe("satır-1\nsatır-2\n");
    expect(readdirSync(dir).sort()).toEqual(["ledger.jsonl", "receipt.json"]);
  });

  it("yazamayan writeSync'te mevcut kaydı değiştirmez, eksik makbuz bırakmaz", () => {
    const dir = directory();
    const ledger = join(dir, "ledger.jsonl");
    writeFileSync(ledger, "eski-1\neski-2\n", { mode: 0o600 });
    mode.value = "stalled";
    expect(() => replaceDurable(ledger, join(dir, ".tmp"), "eski-1\neski-2\nyeni-3\n")).toThrow(
      "GREAT_RESET_FILE_SHORT_WRITE",
    );
    expect(readFileSync(ledger, "utf8")).toBe("eski-1\neski-2\n");
    expect(() => writeNewDurable(join(dir, "receipt.json"), "{}\n")).toThrow(
      "GREAT_RESET_FILE_SHORT_WRITE",
    );
    expect(readdirSync(dir)).toEqual(["ledger.jsonl"]);
  });

  it("var olan dosyanın üzerine yeni makbuz yazmaz", () => {
    const dir = directory();
    writeFileSync(join(dir, "receipt.json"), "önceki\n", { mode: 0o600 });
    expect(() => writeNewDurable(join(dir, "receipt.json"), "yeni\n")).toThrow();
    expect(readFileSync(join(dir, "receipt.json"), "utf8")).toBe("önceki\n");
  });
});
