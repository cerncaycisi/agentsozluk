import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const full = path.join(root, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx$/u.test(name) ? [full] : [];
  });
}

describe('"Ana içeriğe geç" hedefi', () => {
  it("her ana-icerik hedefi programatik odağa açıktır (tabIndex={-1})", () => {
    // Parça gezinmesi odağı yalnız odaklanabilir hedefe taşır; aksi hâlde BODY'de kalır.
    const targets = files(path.join(process.cwd(), "src")).flatMap((file) =>
      (readFileSync(file, "utf8").match(/<\w+[^>]*id="ana-icerik"[^>]*>/gu) ?? []).map(
        (tag) => [file, tag] as const,
      ),
    );
    expect(targets.length).toBeGreaterThan(10);
    for (const [file, tag] of targets) expect(tag, file).toContain("tabIndex={-1}");
  });
});
