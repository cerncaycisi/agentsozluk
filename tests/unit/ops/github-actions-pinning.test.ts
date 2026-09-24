import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isMap, isPair, isScalar, isSeq, parse, parseAllDocuments, visit } from "yaml";

const root = path.join(process.cwd(), ".github");

function yamlFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return yamlFiles(full);
    return /\.ya?ml$/u.test(name) ? [full] : [];
  });
}

type Usage = { reference: string; comment: string | null | undefined };

function pairKey(node: unknown): string | undefined {
  return isPair(node) && isScalar(node.key) ? String(node.key.value) : undefined;
}

const actionPaths = [/^jobs\/[^/]+\/steps$/u, /^jobs\/[^/]+$/u, /^runs\/steps$/u];

/**
 * YAML düğümlerinden bulunan her `uses` kullanımı ve O KULLANIMIN satır sonu yorumu. Yalnız
 * üç tam yol: `jobs.<ad>.steps[].uses`, `jobs.<ad>.uses`, `runs.steps[].uses`. Alias/anchor ve
 * akış (`{…}`/`[…]`) biçimi `.github` altında YASAK — ikisi de denetimi atlatabiliyordu
 * (Astra, PR #200 3. tur); yasak ihlali de kural dışı kullanım olarak raporlanır.
 */
function actionUsages(source: string): Usage[] {
  const usages: Usage[] = [];
  // Ayrıştırma hatası ya da ikinci YAML belgesi sessizce geçmesin (Astra, 4. tur).
  const documents = parseAllDocuments(source);
  const list = Array.isArray(documents) ? documents : [documents];
  if (list.length !== 1) return [{ reference: "tek YAML belgesi olmalı", comment: undefined }];
  const document = list[0]!;
  if (document.errors.length > 0)
    return [
      { reference: `YAML ayrıştırma hatası: ${document.errors[0]!.code}`, comment: undefined },
    ];
  visit(document, {
    Alias() {
      usages.push({ reference: "YAML alias yasak", comment: undefined });
    },
    Node(_key, node) {
      if ("anchor" in node && node.anchor)
        usages.push({ reference: "YAML anchor yasak", comment: undefined });
    },
    Pair(_key, pair, path) {
      if (pairKey(pair) !== "uses") return;
      const route = path.filter(isPair).map(pairKey).join("/");
      if (!actionPaths.some((pattern) => pattern.test(route))) return;
      const value = pair.value;
      const reference = isScalar(value) ? String(value.value) : String(value);
      if (path.some((node) => (isMap(node) || isSeq(node)) && node.flow)) {
        usages.push({ reference: `akış biçimi yasak: ${reference}`, comment: undefined });
        return;
      }
      usages.push({ reference, comment: isScalar(value) ? value.comment : undefined });
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
/**
 * Yerel `./yol` çağrısının hedef `action.yml`/`action.yaml` dosyası (depo köküne göre).
 * `.github` dışına konmuş yerel composite eylem de böylece denetlenir (Astra, 4. tur).
 * Depo dışına çıkan ya da dosyası olmayan yerel çağrı `null`.
 */
function localActionFile(reference: string, repository = process.cwd()): string | null {
  const directory = path.resolve(repository, reference);
  if (!directory.startsWith(`${repository}${path.sep}`)) return null;
  for (const name of ["action.yml", "action.yaml"]) {
    const file = path.join(directory, name);
    if (existsSync(file)) return file;
  }
  return null;
}

/** Workflow dosyalarından başlayıp yerel eylemleri özyinelemeli izleyerek kural dışı kullanımlar. */
function repositoryViolations(entryFiles: string[], repository = process.cwd()): string[] {
  const seen = new Set<string>();
  const queue = [...entryFiles];
  const violations: string[] = [];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    const label = path.relative(repository, file);
    violations.push(...unpinnedReferences(source).map((reference) => `${label}: ${reference}`));
    for (const { reference } of actionUsages(source)) {
      if (!reference.startsWith("./")) continue;
      const target = localActionFile(reference, repository);
      if (target) queue.push(target);
      else violations.push(`${label}: yerel eylem bulunamadı ${reference}`);
    }
  }
  return violations;
}

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
    expect(repositoryViolations(files)).toStrictEqual([]);
  });

  it("yerel eylemin hedefini, .github dışında olsa da izler", () => {
    const repository = mkdtempSync(path.join(tmpdir(), "pin-"));
    try {
      mkdirSync(path.join(repository, ".github/workflows"), { recursive: true });
      mkdirSync(path.join(repository, "ops/unpinned"), { recursive: true });
      const workflow = path.join(repository, ".github/workflows/w.yml");
      writeFileSync(workflow, "jobs:\n  a:\n    steps:\n      - uses: ./ops/unpinned\n");
      writeFileSync(
        path.join(repository, "ops/unpinned/action.yml"),
        "runs:\n  using: composite\n  steps:\n    - uses: actions/checkout@v4\n",
      );
      expect(repositoryViolations([workflow], repository)).toStrictEqual([
        "ops/unpinned/action.yml: actions/checkout@v4",
      ]);
      writeFileSync(workflow, "jobs:\n  a:\n    steps:\n      - uses: ./../dışarı\n");
      expect(repositoryViolations([workflow], repository)).toHaveLength(1);
    } finally {
      rmSync(repository, { recursive: true, force: true });
    }
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
    [
      "akış eşlemesi",
      `jobs:\n  a:\n    steps:\n      - { uses: actions/checkout@${sha} } # v4.4.0\n`,
    ],
    [
      "alias ile pinsiz eylem",
      `jobs:\n  a:\n    strategy:\n      matrix:\n        setup:\n          - &checkout\n            uses: actions/checkout@v4\n    steps:\n      - *checkout\n`,
    ],
    ["ayrıştırma hatası", `jobs:\n  a:\n    steps:\n      - uses: [\n`],
    ["ikinci belge", `jobs: {}\n---\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n`],
  ])("reddeder: %s", (_label, source) => {
    expect(unpinnedReferences(source).length).toBeGreaterThan(0);
  });

  it.each([
    ["pinli", `jobs:\n  a:\n    steps:\n      - uses: actions/checkout@${sha} # v4.4.0\n`],
    [
      "tırnaklı pinli",
      `jobs:\n  a:\n    steps:\n      - uses: "actions/checkout@${sha}" # v4.4.0\n`,
    ],
    ["tırnaklı yerel", `jobs:\n  a:\n    steps:\n      - uses: "./.github/actions/x"\n`],
    [
      "matrix verisindeki uses",
      `jobs:\n  a:\n    strategy:\n      matrix:\n        steps:\n          - uses: fixture-data\n    steps:\n      - run: echo ok\n`,
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
