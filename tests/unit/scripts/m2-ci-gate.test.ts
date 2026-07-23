import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

interface WorkflowStep {
  name?: string;
  run?: string;
  uses?: string;
  with?: { "fetch-depth"?: number };
  "continue-on-error"?: boolean;
}

interface Workflow {
  permissions?: { contents?: string };
  jobs?: { validate?: { steps?: WorkflowStep[] } };
}

const workflow = parse(
  readFileSync(path.join(process.cwd(), ".github/workflows/ci.yml"), "utf8"),
) as Workflow;
const verifyM2Source = readFileSync(path.join(process.cwd(), "scripts/verify-m2.ts"), "utf8");
const steps = workflow.jobs?.validate?.steps ?? [];
const runCommands = steps.flatMap(({ run }) => (run ? [run] : []));
const packageScripts = (
  JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  }
).scripts;

describe("Milestone 2 pull request CI gate", () => {
  it("retains the ordered M1-equivalent validation gates", () => {
    const requiredCommands = [
      "pnpm install --frozen-lockfile",
      "pnpm db:generate",
      "pnpm db:deploy",
      "pnpm format:check",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm smoke:release",
      "pnpm test:unit",
      "pnpm test:integration",
      "pnpm test:coverage",
      "pnpm openapi:validate",
      "pnpm requirements:check",
      "pnpm build",
      "pnpm test:e2e",
      "docker buildx build --load --tag agent-sozluk:ci .",
      "docker compose config",
    ];
    const indexes = requiredCommands.map((command) => runCommands.indexOf(command));

    expect(indexes.every((index) => index >= 0)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((left, right) => left - right));
    expect(workflow.permissions?.contents).toBe("read");
  });

  it("adds all M2 development gates and keeps the all-PASS gate out of pre-merge CI", () => {
    const m2Commands = [
      "pnpm test:agent-simulation",
      "pnpm agent:verify-personas",
      "pnpm agent:scan-metadata",
      "pnpm requirements:m2:check:development",
    ];
    for (const command of m2Commands) expect(runCommands).toContain(command);

    const developmentIndex = runCommands.indexOf("pnpm requirements:m2:check:development");
    expect(developmentIndex).toBeGreaterThan(runCommands.indexOf("docker compose config"));
    expect(runCommands).not.toContain("pnpm requirements:m2:check");
    expect(runCommands).not.toContain("pnpm verify:m2");
    expect(steps.some((step) => step["continue-on-error"] === true)).toBe(false);
  });

  it("scans full reachable history and proves generators leave the candidate tree clean", () => {
    const checkout = steps.find((step) => step.uses === "actions/checkout@v4");
    expect(checkout?.with?.["fetch-depth"]).toBe(0);
    expect(packageScripts["security:scan-secrets"]).toBe("tsx scripts/scan-repository-secrets.ts");
    expect(packageScripts["repo:check-clean"]).toBe("tsx scripts/check-clean-tree.ts");

    const composeIndex = runCommands.indexOf("docker compose config");
    const secretScanIndex = runCommands.indexOf("pnpm security:scan-secrets");
    const cleanTreeIndex = runCommands.indexOf("pnpm repo:check-clean");
    const traceabilityIndex = runCommands.indexOf("pnpm requirements:m2:check:development");
    expect(secretScanIndex).toBeGreaterThan(composeIndex);
    expect(cleanTreeIndex).toBeGreaterThan(secretScanIndex);
    expect(traceabilityIndex).toBeGreaterThan(cleanTreeIndex);
  });

  it("keeps separate pre-merge and final integrated verifier entrypoints", () => {
    expect(packageScripts["verify:m2:development"]).toContain("verify-m2.ts --development");
    expect(packageScripts["verify:m2"]).toMatch(/verify-m2\.ts$/u);
    expect(packageScripts["verify:m2"]).not.toContain("--development");
    expect(verifyM2Source).toContain(
      'run("repository and history secret scan", ["security:scan-secrets"]);',
    );
    expect(verifyM2Source).toContain(
      'if (!developmentTraceability) run("clean candidate tree", ["repo:check-clean"]);',
    );
  });
});
