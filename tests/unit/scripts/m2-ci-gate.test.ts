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

interface WorkflowJob {
  steps?: WorkflowStep[];
  needs?: string[];
  if?: string;
}

interface Workflow {
  permissions?: { contents?: string };
  jobs?: Record<string, WorkflowJob>;
}

const workflow = parse(
  readFileSync(path.join(process.cwd(), ".github/workflows/ci.yml"), "utf8"),
) as Workflow;
const verifyM2Source = readFileSync(path.join(process.cwd(), "scripts/verify-m2.ts"), "utf8");
const setupAction = parse(
  readFileSync(path.join(process.cwd(), ".github/actions/setup-project/action.yml"), "utf8"),
) as { runs?: { steps?: WorkflowStep[] } };
const jobs = workflow.jobs ?? {};
const steps = Object.values(jobs).flatMap(({ steps: jobSteps }) => jobSteps ?? []);
const setupSteps = setupAction.runs?.steps ?? [];
const runCommands = steps.flatMap(({ run }) => (run ? [run] : []));
const setupCommands = setupSteps.flatMap(({ run }) => (run ? [run] : []));
const packageScripts = (
  JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  }
).scripts;

describe("Milestone 2 pull request CI gate", () => {
  it("retains every M1-equivalent validation gate across bounded parallel lanes", () => {
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
    const allCommands = [...setupCommands, ...runCommands];
    for (const command of requiredCommands) expect(allCommands).toContain(command);
    expect(jobs.validate?.needs).toEqual([
      "quality",
      "behavior",
      "database",
      "coverage",
      "browser",
      "container",
    ]);
    expect(jobs.validate?.if).toBe("always()");
    expect(jobs.validate?.steps?.[0]?.run).toContain('test "$QUALITY_RESULT" = success');
    expect(jobs.validate?.steps?.[0]?.run).toContain('test "$CONTAINER_RESULT" = success');
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

    expect(runCommands).not.toContain("pnpm requirements:m2:check");
    expect(runCommands).not.toContain("pnpm verify:m2");
    expect(steps.some((step) => step["continue-on-error"] === true)).toBe(false);
  });

  it("scans full reachable history and proves generators leave the candidate tree clean", () => {
    const checkout = jobs.quality?.steps?.find((step) => step.uses === "actions/checkout@v4");
    expect(checkout?.with?.["fetch-depth"]).toBe(0);
    expect(packageScripts["security:scan-secrets"]).toBe("tsx scripts/scan-repository-secrets.ts");
    expect(packageScripts["repo:check-clean"]).toBe("tsx scripts/check-clean-tree.ts");

    const qualityCommands = (jobs.quality?.steps ?? []).flatMap(({ run }) => (run ? [run] : []));
    const personaIndex = qualityCommands.indexOf("pnpm agent:verify-personas");
    const metadataIndex = qualityCommands.indexOf("pnpm agent:scan-metadata");
    const secretScanIndex = qualityCommands.indexOf("pnpm security:scan-secrets");
    const cleanTreeIndex = qualityCommands.indexOf("pnpm repo:check-clean");
    const traceabilityIndex = qualityCommands.indexOf("pnpm requirements:m2:check:development");
    expect(secretScanIndex).toBeGreaterThan(personaIndex);
    expect(secretScanIndex).toBeGreaterThan(metadataIndex);
    expect(cleanTreeIndex).toBeGreaterThan(secretScanIndex);
    expect(traceabilityIndex).toBeGreaterThan(cleanTreeIndex);
  });

  it("uses one cache writer and restore-only parallel consumers without success artifacts", () => {
    expect(setupSteps.some((step) => step.uses === "actions/cache/restore@v4")).toBe(true);
    expect(setupSteps.filter((step) => step.uses === "actions/cache/save@v4")).toHaveLength(1);
    expect(
      jobs.quality?.steps?.some(
        (step) =>
          step.uses === "./.github/actions/setup-project" &&
          (step as WorkflowStep & { with?: { "save-cache"?: string } }).with?.["save-cache"] ===
            "${{ github.event_name == 'push' }}",
      ),
    ).toBe(true);
    for (const jobName of ["behavior", "database", "coverage", "browser"])
      expect(
        jobs[jobName]?.steps?.some(
          (step) =>
            step.uses === "./.github/actions/setup-project" &&
            "with" in step &&
            Boolean((step as WorkflowStep & { with?: unknown }).with),
        ),
      ).toBe(false);
    expect(steps.some((step) => step.name === "Upload coverage")).toBe(false);
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
