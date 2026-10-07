import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 7 Ekim incelemesi K3: kanonik planın durum bölümü okunabilir kalmalı. Ayrıntılı makbuzlar
// ATTEMPT_LOG/STATUS'a, eski durum anlatısı PLAN_ARSIVI'ne gider.
const MAX_STATUS_LINES = 30;
const plan = readFileSync(path.resolve(__dirname, "../../../docs/PLAN.md"), "utf8");

describe("docs/PLAN.md durum bölümü", () => {
  it("tek bir 'Şu an neredeyiz' bölümü taşır ve 30 satırı aşmaz", () => {
    const lines = plan.split("\n");
    const starts = lines.flatMap((line, index) => (line === "## Şu an neredeyiz" ? [index] : []));
    expect(starts).toHaveLength(1);
    const start = starts[0]!;
    const end = lines.findIndex((line, index) => index > start && /^#{2,3} /u.test(line));
    expect(end).toBeGreaterThan(start);
    const body = lines.slice(start + 1, end);
    expect(
      body.length,
      "PLAN durum bölümü 30 satırı aştı; ayrıntıyı arşive taşı",
    ).toBeLessThanOrEqual(MAX_STATUS_LINES);
  });
});
