import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.join(process.cwd(), ".github");

function yamlFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return yamlFiles(full);
    return /\.ya?ml$/u.test(name) ? [full] : [];
  });
}

/*
  Plan bölüm 4 P2 — Actions digest pin (24 Eylül). `@v4` gibi etiketler taşınabilir: etiketi
  yeniden yazan bir tedarik zinciri saldırısı, release artifact'ını üreten işe de girer. Dış
  eylemler tam commit SHA'sıyla, okunur sürüm yorumuyla kilitli; yerel `./` eylemleri muaf.
*/
describe("GitHub Actions sürüm kilidi", () => {
  const references = yamlFiles(root).flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .map((line) => line.match(/^\s*-?\s*uses:\s*(\S+)(.*)$/u))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => ({
        file: path.relative(process.cwd(), file),
        reference: match[1]!,
        rest: match[2]!,
      })),
  );

  it("en az bir dış eylem bulur (tarama boş geçmez)", () => {
    expect(
      references.filter(({ reference }) => !reference.startsWith("./")).length,
    ).toBeGreaterThan(5);
  });

  it("her dış eylem 40 haneli commit SHA'sı ve sürüm yorumu taşır", () => {
    const unpinned = references.filter(
      ({ reference, rest }) =>
        !reference.startsWith("./") &&
        !(/@[0-9a-f]{40}$/u.test(reference) && /^\s+# v\d+\.\d+\.\d+$/u.test(rest)),
    );
    expect(unpinned).toStrictEqual([]);
  });
});
