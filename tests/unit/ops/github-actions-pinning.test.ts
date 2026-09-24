import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = path.join(process.cwd(), ".github");

function yamlFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return yamlFiles(full);
    return /\.ya?ml$/u.test(name) ? [full] : [];
  });
}

type Step = { uses?: unknown };
type ActionsFile = {
  jobs?: Record<string, { uses?: unknown; steps?: Step[] }>;
  runs?: { steps?: Step[] };
};

/*
  Plan bölüm 4 P2 — Actions digest pin (24 Eylül). `@v4` gibi etiketler taşınabilir; dış
  eylemler tam commit SHA'sına kilitli, sürüm yorumu satırda (Dependabot ikisini birlikte
  günceller).

  KAPSAM BİLEREK DAR: bu test depodaki mevcut workflow ve composite dosyalarının bilinen
  yollarındaki `uses` değerlerinin kilitli kaldığını korur; bütün GitHub Actions biçimlerini
  (yerel Docker eylemi, yerel reusable workflow vb.) kapsayan bir politika denetçisi DEĞİLDİR.
  Genel denetçi PR #200'de beş Astra turu boyunca her turda yeni bir kenar durumu verdi ve
  bırakıldı; yeni bir eylem biçimi eklenirse bu dar test genişletilmeli.
*/
describe("GitHub Actions sürüm kilidi (mevcut dosyalar)", () => {
  const dependabot = path.join(root, "dependabot.yml");
  const references = yamlFiles(root)
    .filter((file) => file !== dependabot)
    .flatMap((file) => {
      const document = (parse(readFileSync(file, "utf8")) ?? {}) as ActionsFile;
      const steps: Step[] = [
        ...Object.values(document.jobs ?? {}).flatMap((job) => [
          ...(job.uses === undefined ? [] : [{ uses: job.uses }]),
          ...(job.steps ?? []),
        ]),
        ...(document.runs?.steps ?? []),
      ];
      return steps.flatMap((step) =>
        step.uses === undefined
          ? []
          : [{ file: path.relative(process.cwd(), file), reference: String(step.uses) }],
      );
    });
  const external = references.filter(({ reference }) => !reference.startsWith("./"));

  it("dış eylemleri bulur (tarama boş geçmez)", () => {
    expect(external.length).toBeGreaterThan(10);
  });

  it("her dış eylem 40 haneli commit SHA'sına kilitli", () => {
    expect(
      external.filter(({ reference }) => !/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/u.test(reference)),
    ).toStrictEqual([]);
  });

  it("Dependabot kök ve composite eylem dizinlerini günceller", () => {
    const config = parse(readFileSync(dependabot, "utf8")) as {
      updates: Array<{ "package-ecosystem": string; directories?: string[] }>;
    };
    const actions = config.updates.find((entry) => entry["package-ecosystem"] === "github-actions");
    expect(actions?.directories).toEqual(expect.arrayContaining(["/", "/.github/actions/*"]));
  });
});
