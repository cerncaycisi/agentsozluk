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
type Workflow = {
  jobs?: Record<string, { uses?: unknown; steps?: Step[] }>;
  runs?: { steps?: Step[] };
};

/** YAML ayrıştırılarak bulunan bütün `uses` değerleri: iş adımları, reusable workflow çağrıları, composite adımlar. */
function actionReferences(source: string): string[] {
  const document = (parse(source) ?? {}) as Workflow;
  const steps: Step[] = [
    ...Object.values(document.jobs ?? {}).flatMap((job) => [
      ...(job.uses === undefined ? [] : [{ uses: job.uses }]),
      ...(job.steps ?? []),
    ]),
    ...(document.runs?.steps ?? []),
  ];
  return steps.flatMap((step) => (step.uses === undefined ? [] : [String(step.uses)]));
}

/**
 * Kurala uymayan referanslar. Yerel `./` muaf. `docker://` yalnız `@sha256:<64 hex>` ile.
 * Dış eylem 40 haneli commit SHA'sı taşır ve kaynak satırında `# vX.Y.Z` yorumu bulunur.
 * Yorumun SHA ile gerçekten eşleştiğini bu test DOĞRULAMAZ (ağ yok); eşleme kanıtı pin
 * güncellemesinde GitHub API'den alınıp PR'a/ATTEMPT_LOG'a yazılır.
 */
function unpinnedReferences(source: string): string[] {
  return actionReferences(source).filter((reference) => {
    if (reference.startsWith("./")) return false;
    if (reference.startsWith("docker://")) return !/@sha256:[0-9a-f]{64}$/u.test(reference);
    if (!/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/u.test(reference)) return true;
    const escaped = reference.replaceAll(/[.*+?^${}()|[\]\\/]/gu, "\\$&");
    return !new RegExp(`${escaped}["']?\\s+#\\s*v\\d+\\.\\d+\\.\\d+\\s*$`, "mu").test(source);
  });
}

/*
  Plan bölüm 4 P2 — Actions digest pin (24 Eylül). `@v4` gibi etiketler taşınabilir: etiketi
  yeniden yazan bir tedarik zinciri saldırısı, release artifact'ını üreten işe de girer.
*/
describe("GitHub Actions sürüm kilidi", () => {
  const files = yamlFiles(root).filter((file) => !file.endsWith("dependabot.yml"));

  it("depodaki bütün workflow ve composite eylemler kilitli", () => {
    const external = files.flatMap((file) =>
      actionReferences(readFileSync(file, "utf8")).filter((ref) => !ref.startsWith("./")),
    );
    expect(external.length).toBeGreaterThan(10);
    const unpinned = files.flatMap((file) =>
      unpinnedReferences(readFileSync(file, "utf8")).map(
        (reference) => `${path.relative(process.cwd(), file)}: ${reference}`,
      ),
    );
    expect(unpinned).toStrictEqual([]);
  });

  const sha = "11d5960a326750d5838078e36cf38b85af677262";
  it.each([
    ["etiket", `jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n`],
    ["tırnaklı etiket", `jobs:\n  a:\n    steps:\n      - uses: "actions/checkout@v4"\n`],
    ["satır içi eşleme", `jobs:\n  a:\n    steps: [{ uses: actions/checkout@v4 }]\n`],
    ["reusable workflow", `jobs:\n  a:\n    uses: org/repo/.github/workflows/x.yml@main\n`],
    ["composite", `runs:\n  using: composite\n  steps:\n    - uses: actions/cache@v4\n`],
    ["docker etiketi", `jobs:\n  a:\n    steps:\n      - uses: docker://alpine:3.20\n`],
    ["sürüm yorumsuz SHA", `jobs:\n  a:\n    steps:\n      - uses: actions/checkout@${sha}\n`],
  ])("reddeder: %s", (_label, source) => {
    expect(unpinnedReferences(source)).toHaveLength(1);
  });

  it.each([
    ["pinli", `jobs:\n  a:\n    steps:\n      - uses: actions/checkout@${sha} # v4.4.0\n`],
    [
      "tırnaklı pinli",
      `jobs:\n  a:\n    steps:\n      - uses: "actions/checkout@${sha}" # v4.4.0\n`,
    ],
    ["tırnaklı yerel", `jobs:\n  a:\n    steps:\n      - uses: "./.github/actions/x"\n`],
    [
      "run metnindeki uses",
      `jobs:\n  a:\n    steps:\n      - run: |\n          echo "uses: actions/checkout@v4"\n`,
    ],
    [
      "docker digest",
      `jobs:\n  a:\n    steps:\n      - uses: docker://alpine@sha256:${"a".repeat(64)}\n`,
    ],
  ])("kabul eder: %s", (_label, source) => {
    expect(unpinnedReferences(source)).toStrictEqual([]);
  });

  it("Dependabot composite eylem dizinini de günceller", () => {
    const config = parse(readFileSync(path.join(root, "dependabot.yml"), "utf8")) as {
      updates: Array<{ "package-ecosystem": string; directories?: string[] }>;
    };
    const actions = config.updates.find((entry) => entry["package-ecosystem"] === "github-actions");
    expect(actions?.directories).toEqual(expect.arrayContaining(["/", "/.github/actions/*"]));
  });
});
