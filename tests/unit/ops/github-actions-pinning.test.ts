import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isMap, isPair, isScalar, parse, parseDocument, visit } from "yaml";

const root = path.join(process.cwd(), ".github");

function yamlFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return yamlFiles(full);
    return /\.ya?ml$/u.test(name) ? [full] : [];
  });
}

type Usage = { reference: string; comment: string | undefined };

function pairKey(node: unknown): string | undefined {
  return isPair(node) && isScalar(node.key) ? String(node.key.value) : undefined;
}

/**
 * YAML düğümlerinden bulunan her `uses` kullanımı ve O KULLANIMIN satır sonu yorumu: iş
 * adımları (`…steps[].uses`), reusable workflow çağrıları (`jobs.<ad>.uses`) ve composite
 * adımlar (`runs.steps[].uses`). `run:` metni ya da başka anahtarların altındaki `uses`
 * sayılmaz. Akış eşlemesinde (`- { uses: … } # v1.2.3`) yorum eşlemeye bağlanır.
 */
function actionUsages(source: string): Usage[] {
  const usages: Usage[] = [];
  visit(parseDocument(source), {
    Pair(_key, pair, path) {
      if (pairKey(pair) !== "uses") return;
      const ancestors = path.filter(isPair).map(pairKey);
      const inSteps = ancestors.at(-1) === "steps";
      const isJob = ancestors.at(-2) === "jobs";
      if (!inSteps && !isJob) return;
      const parent = path.at(-1);
      const value = pair.value;
      usages.push({
        reference: isScalar(value) ? String(value.value) : String(value),
        comment:
          (isScalar(value) ? value.comment : undefined) ??
          (isMap(parent) && parent.flow ? parent.comment : undefined),
      });
    },
  });
  return usages;
}

/**
 * Kurala uymayan kullanımlar. Yerel `./` muaf. `docker://` yalnız `@sha256:<64 hex>` ile.
 * Dış eylem 40 haneli commit SHA'sı ve kendi satırında `# vX.Y.Z` yorumu taşır. Yorumun SHA
 * ile gerçekten eşleştiğini bu test DOĞRULAMAZ (ağ yok); eşleme kanıtı pin güncellemesinde
 * GitHub API'den alınıp PR'a/ATTEMPT_LOG'a yazılır.
 */
function unpinnedReferences(source: string): string[] {
  return actionUsages(source)
    .filter(({ reference, comment }) => {
      if (reference.startsWith("./")) return false;
      if (reference.startsWith("docker://")) return !/@sha256:[0-9a-f]{64}$/u.test(reference);
      return !(
        /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/u.test(reference) &&
        /^\s*v\d+\.\d+\.\d+\s*$/u.test(comment ?? "")
      );
    })
    .map(({ reference }) => reference);
}

/*
  Plan bölüm 4 P2 — Actions digest pin (24 Eylül). `@v4` gibi etiketler taşınabilir: etiketi
  yeniden yazan bir tedarik zinciri saldırısı, release artifact'ını üreten işe de girer.
*/
describe("GitHub Actions sürüm kilidi", () => {
  const dependabot = path.join(root, "dependabot.yml");
  const files = yamlFiles(root).filter((file) => file !== dependabot);

  it("depodaki bütün workflow ve composite eylemler kilitli", () => {
    const external = files.flatMap((file) =>
      actionUsages(readFileSync(file, "utf8")).filter(
        ({ reference }) => !reference.startsWith("./"),
      ),
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
    [
      "ikinci kullanım yorumsuz",
      `jobs:\n  a:\n    steps:\n      - uses: actions/checkout@${sha} # v4.4.0\n      - uses: actions/checkout@${sha}\n`,
    ],
    [
      "yorum yalnız run metninde",
      `jobs:\n  a:\n    steps:\n      - run: |\n          echo "actions/checkout@${sha} # v4.4.0"\n      - uses: actions/checkout@${sha}\n`,
    ],
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
      "akış eşlemesi",
      `jobs:\n  a:\n    steps:\n      - { uses: actions/checkout@${sha} } # v4.4.0\n`,
    ],
    [
      "kaçışlı tırnaklı",
      `jobs:\n  a:\n    steps:\n      - uses: "actions\\x2fcheckout@${sha}" # v4.4.0\n`,
    ],
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
