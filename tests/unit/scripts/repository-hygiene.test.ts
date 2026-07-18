import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatDirtyTree, inspectCleanTree } from "../../../scripts/clean-tree-policy";
import {
  formatSecretFindings,
  scanRepositorySecrets,
} from "../../../scripts/repository-secret-scan";

const temporaryRepositories: string[] = [];

function git(repository: string, ...arguments_: string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function repository(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "agent-sozluk-hygiene-"));
  temporaryRepositories.push(directory);
  git(directory, "init", "--quiet");
  git(directory, "config", "user.email", "fixture@example.test");
  git(directory, "config", "user.name", "Fixture User");
  writeFileSync(path.join(directory, "README.md"), "fixture\n", { mode: 0o600 });
  git(directory, "add", "README.md");
  git(directory, "commit", "--quiet", "-m", "initial fixture");
  return directory;
}

afterEach(() => {
  for (const directory of temporaryRepositories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("repository secret scan", () => {
  it("allows only controlled fixture and environment placeholders", () => {
    const root = repository();
    writeFileSync(
      path.join(root, ".env.example"),
      [
        "APP_SECRET=agent-sozluk-ci-validation-only-secret",
        "PASSWORD=change-this-demo-password",
        "API_KEY=<replace-me>",
        "TOKEN=${FIXTURE_TOKEN}",
      ].join("\n"),
      { mode: 0o600 },
    );

    expect(scanRepositorySecrets(root)).toEqual([]);
  });

  it("reports only metadata for tracked and untracked current-tree secrets", () => {
    const root = repository();
    const providerToken = ["ghp", "_", "A".repeat(40)].join("");
    const assignedCredential = ["M9", "qR7", "vT4", "xZ8", "pL2", "nK6"].join("-");
    writeFileSync(path.join(root, "tracked.env"), `PROVIDER_TOKEN=${providerToken}\n`, {
      mode: 0o600,
    });
    git(root, "add", "tracked.env");
    writeFileSync(path.join(root, "untracked.env"), `CLIENT_SECRET=${assignedCredential}\n`, {
      mode: 0o600,
    });
    mkdirSync(path.join(root, "tests"));
    writeFileSync(path.join(root, "tests", "provider-fixture.env"), `TOKEN=${providerToken}\n`, {
      mode: 0o600,
    });
    writeFileSync(
      path.join(root, "tests", "unapproved-fixture.env"),
      `CLIENT_SECRET=${assignedCredential}\n`,
      { mode: 0o600 },
    );

    const findings = scanRepositorySecrets(root);
    const rendered = formatSecretFindings(findings);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "tree",
          ruleId: "GITHUB_PROVIDER_TOKEN",
          path: "tracked.env",
          line: 1,
        }),
        expect.objectContaining({
          scope: "tree",
          ruleId: "CREDENTIAL_ASSIGNMENT",
          path: "untracked.env",
          line: 1,
        }),
        expect.objectContaining({
          scope: "tree",
          ruleId: "GITHUB_PROVIDER_TOKEN",
          path: "tests/provider-fixture.env",
          line: 1,
        }),
        expect.objectContaining({
          scope: "tree",
          ruleId: "CREDENTIAL_ASSIGNMENT",
          path: "tests/unapproved-fixture.env",
          line: 1,
        }),
      ]),
    );
    expect(rendered).not.toContain(providerToken);
    expect(rendered).not.toContain(assignedCredential);
    expect(rendered).toContain('path="tracked.env" line=1');
  });

  it("finds a secret removed from the current tree in reachable history without rendering it", () => {
    const root = repository();
    const privateKeyMarker = ["-----BEGIN", " OPENSSH PRIVATE KEY-----"].join("");
    writeFileSync(path.join(root, "retired-key.txt"), `${privateKeyMarker}\n`, { mode: 0o600 });
    git(root, "add", "retired-key.txt");
    git(root, "commit", "--quiet", "-m", "add retired fixture");
    const secretCommit = git(root, "rev-parse", "HEAD");
    writeFileSync(path.join(root, "retired-key.txt"), "removed\n", { mode: 0o600 });
    git(root, "add", "retired-key.txt");
    git(root, "commit", "--quiet", "-m", "remove retired fixture");

    const findings = scanRepositorySecrets(root);
    const historyFinding = findings.find(
      (finding) => finding.scope === "history" && finding.ruleId === "PRIVATE_KEY_BLOCK",
    );
    const rendered = formatSecretFindings(findings);

    expect(historyFinding).toMatchObject({
      path: "retired-key.txt",
      commit: secretCommit,
      line: 1,
    });
    expect(rendered).not.toContain(privateKeyMarker);
    expect(rendered).toContain(`commit=${secretCommit}`);
  });

  it("scans a staged blob even when the working copy was replaced before the gate", () => {
    const root = repository();
    const stagedCredential = ["Q7", "mX4", "pV9", "kR2", "tN8", "zL5"].join("-");
    writeFileSync(path.join(root, "staged.env"), `CLIENT_SECRET=${stagedCredential}\n`, {
      mode: 0o600,
    });
    git(root, "add", "staged.env");
    writeFileSync(path.join(root, "staged.env"), "CLIENT_SECRET=<replace-me>\n", { mode: 0o600 });

    const findings = scanRepositorySecrets(root);
    const rendered = formatSecretFindings(findings);

    expect(findings).toContainEqual({
      scope: "tree",
      ruleId: "CREDENTIAL_ASSIGNMENT",
      path: "staged.env",
      line: 1,
    });
    expect(rendered).not.toContain(stagedCredential);
  });

  it("keeps the CLI stdout and stderr free of a detected value", () => {
    const root = repository();
    const providerToken = ["github", "_pat_", "B".repeat(40)].join("");
    writeFileSync(path.join(root, "credential.env"), `TOKEN=${providerToken}\n`, { mode: 0o600 });
    const projectRoot = process.cwd();
    const result = spawnSync(
      process.execPath,
      [
        path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs"),
        path.join(projectRoot, "scripts", "scan-repository-secrets.ts"),
      ],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("rule=GITHUB_PROVIDER_TOKEN scope=tree");
    expect(result.stderr).toContain('path="credential.env" line=1');
    expect(result.stderr).not.toContain(providerToken);
  });
});

describe("clean-tree policy", () => {
  it("passes a clean repository and reports deterministic path metadata when dirty", () => {
    const root = repository();
    expect(inspectCleanTree(root)).toEqual([]);

    writeFileSync(path.join(root, "README.md"), "changed content must not be rendered\n", {
      mode: 0o600,
    });
    writeFileSync(path.join(root, "untracked.txt"), "untracked content must not be rendered\n", {
      mode: 0o600,
    });

    const entries = inspectCleanTree(root);
    const rendered = formatDirtyTree(entries);
    expect(entries).toEqual([
      { status: " M", path: "README.md" },
      { status: "??", path: "untracked.txt" },
    ]);
    expect(rendered).toContain('status=" M" path="README.md"');
    expect(rendered).not.toContain("changed content");
    expect(rendered).not.toContain("untracked content");
  });
});
