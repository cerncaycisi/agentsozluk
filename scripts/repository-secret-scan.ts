import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

const MAX_GIT_OUTPUT_BYTES = 256 * 1024 * 1024;

export type SecretFindingScope = "tree" | "history";

export interface SecretFinding {
  scope: SecretFindingScope;
  ruleId: string;
  path: string;
  line?: number;
  commit?: string;
}

interface SecretRule {
  id: string;
  pattern: RegExp;
}

const directSecretRules: readonly SecretRule[] = [
  {
    id: "PRIVATE_KEY_BLOCK",
    pattern:
      /-----BEGIN (?:(?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----/u,
  },
  {
    id: "GITHUB_PROVIDER_TOKEN",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{20,255})\b/u,
  },
  {
    id: "OPENAI_PROVIDER_TOKEN",
    pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,255}\b/u,
  },
  {
    id: "ANTHROPIC_PROVIDER_TOKEN",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,255}\b/u,
  },
  {
    id: "GOOGLE_PROVIDER_TOKEN",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/u,
  },
  {
    id: "AWS_ACCESS_KEY_ID",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
  },
  {
    id: "SLACK_PROVIDER_TOKEN",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,255}\b/u,
  },
  {
    id: "GITLAB_PROVIDER_TOKEN",
    pattern: /\bglpat-[A-Za-z0-9_-]{20,255}\b/u,
  },
  {
    id: "NPM_PROVIDER_TOKEN",
    pattern: /\bnpm_[A-Za-z0-9]{36,255}\b/u,
  },
  {
    id: "SENDGRID_PROVIDER_TOKEN",
    pattern: /\bSG\.[A-Za-z0-9_-]{16,255}\.[A-Za-z0-9_-]{16,255}\b/u,
  },
  {
    id: "STRIPE_LIVE_SECRET",
    pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,255}\b/u,
  },
  {
    id: "AGENT_RUNTIME_CREDENTIAL",
    pattern: /\bagt_[A-Za-z0-9_-]{40,100}\b/u,
  },
];

const credentialKeyPattern =
  "(?:(?:[A-Za-z][A-Za-z0-9_-]*[_-])?(?:api[_-]?key|access[_-]?(?:key|token)|auth[_-]?token|bearer(?:[_-]?token)?|client[_-]?secret|private[_-]?key|app[_-]?secret|database[_-]?url|password|passwd|credential|secret|token)|[A-Za-z][A-Za-z0-9]*(?:ApiKey|AccessKey|AccessToken|AuthToken|BearerToken|ClientSecret|PrivateKey|AppSecret|DatabaseUrl|Password|Passwd|Credential|Secret|Token))";
const declaredCredentialAssignmentPattern = new RegExp(
  `^\\s*(?:const|let|var)\\s+(${credentialKeyPattern})\\s*=\\s*(["'\`])([^"'\`\\r\\n]{12,})\\2\\s*;?\\s*$`,
  "iu",
);
const propertyCredentialAssignmentPattern = new RegExp(
  `^\\s*["']?(${credentialKeyPattern})["']?\\s*:\\s*(["'\`])([^"'\`\\r\\n]{12,})\\2\\s*,?\\s*$`,
  "iu",
);
const configurationCredentialAssignmentPattern = new RegExp(
  `^\\s*(?:(?:export|ENV|ARG)\\s+)?["']?(${credentialKeyPattern})["']?\\s*(?:=|:)\\s*(?:(["'\`])([^"'\`\\r\\n]{12,})\\2|([^\\s#]{12,}))\\s*,?\\s*(?:#.*)?$`,
  "iu",
);

const placeholderPatterns: readonly RegExp[] = [
  /^<[^>\r\n]+>$/u,
  /^\$\{[A-Z][A-Z0-9_]*(?::-[^}\r\n]*)?\}$/u,
  /^(?:change|replace)(?:[-_][A-Za-z0-9]+)+$/u,
  /^(?:test|testing|dummy|fake|mock|fixture|example|placeholder|redacted|not-a-real)(?:[-_][A-Za-z0-9]+)*$/iu,
  /^(?=.{12,}$)(?=.*(?:^|[-_./])(?:build-only|demo|development|dummy|example|fake|fixture|local|mock|placeholder|sample|test|validation-only)(?:[-_./]|$))[A-Za-z0-9_./+@:=?${}-]+$/iu,
];

const exactPlaceholderValues = new Set([
  "agent-sozluk-ci-validation-only-secret",
  "agent-sozluk-e2e-validation-only-secret",
  "agent-sozluk-m2-verification-only-secret",
  "agent-sozluk-test-startup-secret-value",
  "agent-sozluk-verification-only-secret",
  "test-secret-with-at-least-thirty-two-bytes",
]);

function isAllowedPlaceholder(value: string): boolean {
  if (
    exactPlaceholderValues.has(value) ||
    placeholderPatterns.some((pattern) => pattern.test(value))
  ) {
    return true;
  }
  try {
    const candidate = new URL(value);
    return (
      ["postgres:", "postgresql:"].includes(candidate.protocol) &&
      ["127.0.0.1", "localhost", "db", "postgres"].includes(candidate.hostname) &&
      ["agent_sozluk", "postgres", "test"].includes(candidate.username) &&
      ["agent_sozluk", "postgres", "test"].includes(candidate.password)
    );
  } catch {
    return false;
  }
}

function isHighConfidenceCredentialValue(value: string): boolean {
  if (isAllowedPlaceholder(value) || value.includes("${") || /\s/u.test(value)) return false;
  if (/^[a-f0-9]{32,}$/iu.test(value)) return true;
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/:\s]+:[^@\s]+@/iu.test(value)) return true;

  const characterClasses = [/[a-z]/u, /[A-Z]/u, /\d/u, /[^A-Za-z0-9]/u].filter((pattern) =>
    pattern.test(value),
  ).length;
  return value.length >= 16 && characterClasses >= 3;
}

function isConfigurationLike(relativePath: string): boolean {
  const baseName = path.basename(relativePath);
  return (
    baseName === "Dockerfile" ||
    baseName.startsWith(".env") ||
    /\.env(?:\.|$)/iu.test(baseName) ||
    /\.(?:json|md|sh|ya?ml)$/iu.test(relativePath)
  );
}

interface CredentialAssignmentCandidate {
  key: string;
  value: string;
}

// These exact path/key pairs are established non-secret examples in fixtures.
// Provider-token and private-key rules run first and can never be allowlisted here.
const controlledAssignmentFixtures = new Map<string, ReadonlySet<string>>([
  ["Dockerfile", new Set(["databaseurl"])],
  ["README.md", new Set(["appsecret"])],
  ["docs/API.md", new Set(["password"])],
  ["tests/e2e/auth-content.spec.ts", new Set(["newpassword"])],
  ["tests/e2e/moderation-workflows.spec.ts", new Set(["password"])],
  ["tests/integration/agent-control-plane.test.ts", new Set(["password"])],
  [
    "tests/integration/topics-entries-interactions.test.ts",
    new Set(["newpassword", "password", "targetpassword"]),
  ],
  ["tests/unit/auth/password.test.ts", new Set(["password"])],
]);

function normalizedCredentialKey(value: string): string {
  return value.replaceAll(/[_-]/gu, "").toLowerCase();
}

function isControlledFixtureAssignment(relativePath: string, key: string): boolean {
  return Boolean(controlledAssignmentFixtures.get(relativePath)?.has(normalizedCredentialKey(key)));
}

function credentialAssignmentValues(
  line: string,
  relativePath: string,
): CredentialAssignmentCandidate[] {
  const values: CredentialAssignmentCandidate[] = [];
  for (const pattern of [
    declaredCredentialAssignmentPattern,
    propertyCredentialAssignmentPattern,
  ]) {
    const match = pattern.exec(line);
    if (match?.[1] && match[3]) values.push({ key: match[1], value: match[3] });
  }
  if (isConfigurationLike(relativePath)) {
    const match = configurationCredentialAssignmentPattern.exec(line);
    const value = match?.[3] ?? match?.[4];
    if (match?.[1] && value) values.push({ key: match[1], value });
  }
  return values;
}

function gitOutput(repositoryRoot: string, arguments_: readonly string[]): Buffer {
  const result = spawnSync("git", ["-C", repositoryRoot, ...arguments_], {
    encoding: null,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    throw new Error("REPOSITORY_GIT_COMMAND_FAILED");
  }
  return result.stdout;
}

export function resolveRepositoryRoot(startDirectory: string): string {
  const output = gitOutput(startDirectory, ["rev-parse", "--show-toplevel"])
    .toString("utf8")
    .trim();
  if (!path.isAbsolute(output)) throw new Error("REPOSITORY_ROOT_INVALID");
  return path.normalize(output);
}

function findingKey(finding: SecretFinding): string {
  return [
    finding.scope,
    finding.ruleId,
    finding.path,
    String(finding.line ?? ""),
    finding.commit ?? "",
  ].join("\0");
}

function compareFindings(left: SecretFinding, right: SecretFinding): number {
  return findingKey(left).localeCompare(findingKey(right), "en");
}

export function scanSecretText(
  source: string,
  metadata: Pick<SecretFinding, "scope" | "path" | "commit">,
): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = source.split(/\r?\n/u);

  for (const [index, line] of lines.entries()) {
    const directMatches = directSecretRules.filter(({ pattern }) => pattern.test(line));
    if (directMatches.length > 0) {
      for (const rule of directMatches) {
        findings.push({ ...metadata, ruleId: rule.id, line: index + 1 });
      }
      continue;
    }

    for (const { key, value } of credentialAssignmentValues(line, metadata.path)) {
      if (isControlledFixtureAssignment(metadata.path, key)) continue;
      if (isHighConfidenceCredentialValue(value)) {
        findings.push({ ...metadata, ruleId: "CREDENTIAL_ASSIGNMENT", line: index + 1 });
        break;
      }
    }
  }

  return findings;
}

function repositoryPath(repositoryRoot: string, relativePath: string): string {
  const absolutePath = path.resolve(repositoryRoot, relativePath);
  const rootPrefix = `${repositoryRoot}${path.sep}`;
  if (absolutePath !== repositoryRoot && !absolutePath.startsWith(rootPrefix)) {
    throw new Error("REPOSITORY_PATH_ESCAPES_ROOT");
  }
  return absolutePath;
}

export function scanCurrentRepositoryTree(repositoryRoot: string): SecretFinding[] {
  const listed = gitOutput(repositoryRoot, [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ])
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "en"));
  const findings: SecretFinding[] = [];

  for (const relativePath of listed) {
    const absolutePath = repositoryPath(repositoryRoot, relativePath);
    let stat;
    try {
      stat = lstatSync(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw new Error("REPOSITORY_TREE_READ_FAILED");
    }
    if (!stat.isFile()) continue;
    let source: string;
    try {
      source = readFileSync(absolutePath).toString("utf8");
    } catch {
      throw new Error("REPOSITORY_TREE_READ_FAILED");
    }
    findings.push(...scanSecretText(source, { scope: "tree", path: relativePath }));
  }

  const indexEntries = gitOutput(repositoryRoot, ["ls-files", "--stage", "-z"])
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .flatMap((record) => {
      const tabIndex = record.indexOf("\t");
      if (tabIndex < 0) return [];
      const [, objectId] = record.slice(0, tabIndex).split(" ");
      const relativePath = record.slice(tabIndex + 1);
      return objectId && relativePath ? [{ objectId, relativePath }] : [];
    })
    .sort((left, right) =>
      `${left.relativePath}\0${left.objectId}`.localeCompare(
        `${right.relativePath}\0${right.objectId}`,
        "en",
      ),
    );
  for (const entry of indexEntries) {
    const source = gitOutput(repositoryRoot, ["cat-file", "blob", entry.objectId]).toString("utf8");
    findings.push(...scanSecretText(source, { scope: "tree", path: entry.relativePath }));
  }

  return findings.sort(compareFindings);
}

interface TreeBlob {
  objectId: string;
  path: string;
}

function parseTreeBlobs(output: Buffer): TreeBlob[] {
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .flatMap((record) => {
      const tabIndex = record.indexOf("\t");
      if (tabIndex < 0) return [];
      const [mode, type, objectId] = record.slice(0, tabIndex).split(" ");
      const relativePath = record.slice(tabIndex + 1);
      if (!mode || type !== "blob" || !objectId || !relativePath) return [];
      return [{ objectId, path: relativePath }];
    });
}

export function scanReachableGitHistory(repositoryRoot: string): SecretFinding[] {
  const commits = gitOutput(repositoryRoot, ["rev-list", "--all"])
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "en"));
  const scannedBlobPaths = new Set<string>();
  const findings: SecretFinding[] = [];

  for (const commit of commits) {
    const blobs = parseTreeBlobs(
      gitOutput(repositoryRoot, ["ls-tree", "-r", "-z", "--full-tree", commit]),
    );
    for (const blob of blobs) {
      const blobPathKey = `${blob.objectId}\0${blob.path}`;
      if (scannedBlobPaths.has(blobPathKey)) continue;
      scannedBlobPaths.add(blobPathKey);
      const source = gitOutput(repositoryRoot, ["cat-file", "blob", blob.objectId]).toString(
        "utf8",
      );
      findings.push(
        ...scanSecretText(source, {
          scope: "history",
          path: blob.path,
          commit,
        }),
      );
    }
  }

  return findings.sort(compareFindings);
}

export function scanRepositorySecrets(startDirectory: string): SecretFinding[] {
  const repositoryRoot = resolveRepositoryRoot(startDirectory);
  const findings = [
    ...scanCurrentRepositoryTree(repositoryRoot),
    ...scanReachableGitHistory(repositoryRoot),
  ];
  const unique = new Map(findings.map((finding) => [findingKey(finding), finding]));
  return [...unique.values()].sort(compareFindings);
}

function printablePath(value: string): string {
  return JSON.stringify(value);
}

export function formatSecretFindings(findings: readonly SecretFinding[]): string {
  const lines = findings.map((finding) => {
    const location =
      finding.scope === "tree"
        ? `path=${printablePath(finding.path)} line=${finding.line ?? 0}`
        : `path=${printablePath(finding.path)} commit=${finding.commit ?? "UNKNOWN"} line=${finding.line ?? 0}`;
    return `rule=${finding.ruleId} scope=${finding.scope} ${location}`;
  });
  return [
    `Repository secret scan failed: ${findings.length} metadata-only finding(s).`,
    ...lines,
  ].join("\n");
}
