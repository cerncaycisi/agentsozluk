export type M2TraceabilityMode = "development" | "final";
export type M2TraceabilityStatus = "PASS" | "FAIL" | "BLOCKED";

interface DevelopmentBlocker {
  sourceLine: number;
  rationale: string;
}

/**
 * Requirements that cannot be verified honestly until the working branch has
 * been merged and the named production/operator gate has run. Keep this list
 * explicit: development CI must never infer exemptions from an ID prefix or
 * from free-form traceability text.
 */
export const M2_DEVELOPMENT_BLOCKERS = {
  "V1-007": {
    sourceLine: 231,
    rationale:
      "Production data preservation needs the post-merge backup, migration, and restore checks.",
  },
  "RUNTIME-001": {
    sourceLine: 653,
    rationale: "The dedicated production OS user is installed and verified only after merge.",
  },
  "RUNTIME-002": {
    sourceLine: 656,
    rationale:
      "The production runtime user's privileges and filesystem access need a live host check.",
  },
  "RUNTIME-003": {
    sourceLine: 665,
    rationale:
      "The isolated Codex home becomes real only when the production runtime host is installed.",
  },
  "RUNTIME-004": {
    sourceLine: 670,
    rationale: "Interactive Codex login is an explicit post-merge operator gate.",
  },
  "RUNTIME-006": {
    sourceLine: 675,
    rationale:
      "Installed Codex CLI version and help inspection runs on the production runtime host after login.",
  },
  "RUNTIME-007": {
    sourceLine: 682,
    rationale:
      "The real installed CLI structured-output mechanism is verified after the production login gate.",
  },
  "DONE-034": {
    sourceLine: 3383,
    rationale:
      "A working real Codex CLI runtime needs the installed production runtime and operator login.",
  },
  "DONE-037": {
    sourceLine: 3386,
    rationale: "The real CLI benchmark is explicitly scheduled after production Codex login.",
  },
  "DONE-038": {
    sourceLine: 3387,
    rationale: "Production p50, p75, and p95 measurements come from the post-login benchmark.",
  },
  "DONE-072": {
    sourceLine: 3421,
    rationale:
      "Production data preservation is closed by the post-merge backup, migration, and restore drill.",
  },
  "DONE-073": {
    sourceLine: 3422,
    rationale: "Production backup and restore verification is a post-merge operator action.",
  },
  "DONE-074": {
    sourceLine: 3423,
    rationale: "The systemd unit can be active only after production host installation.",
  },
  "DONE-075": {
    sourceLine: 3424,
    rationale: "Production smoke runs only after the merged revision is deployed.",
  },
  "DONE-076": {
    sourceLine: 3425,
    rationale: "The first five-agent Day 0 stage is a post-smoke production operation.",
  },
  "DONE-077": {
    sourceLine: 3426,
    rationale: "Ten-agent activation follows the live Day 0 green criteria.",
  },
  "DONE-078": {
    sourceLine: 3427,
    rationale: "The first three scheduled runs require the activated production runtime.",
  },
  "DONE-079": {
    sourceLine: 3428,
    rationale: "Human smoke is verified against the deployed production application.",
  },
  "DONE-082": {
    sourceLine: 3431,
    rationale:
      "All 543 rows can become PASS only after every post-merge production blocker closes.",
  },
  "DONE-084": {
    sourceLine: 3433,
    rationale: "Production and main SHAs can match only after the approved merge and deployment.",
  },
} as const satisfies Record<string, DevelopmentBlocker>;

export const M2_DEVELOPMENT_BLOCKER_IDS = Object.freeze(
  Object.keys(M2_DEVELOPMENT_BLOCKERS).sort(),
);

export interface RequirementManifest {
  count: number;
  requirements: Array<{ id: string; sourceLine: number; summary: string }>;
}

interface TraceabilityRow {
  id: string;
  implementation: string;
  validation: string;
  status: string;
}

export interface M2TraceabilityCheckInput {
  manifest: RequirementManifest;
  requirementsDocument: string;
  traceabilityDocument: string;
  mode: M2TraceabilityMode;
}

export interface M2TraceabilityCheckResult {
  total: number;
  passed: number;
  blocked: number;
}

const requirementIdPattern = /^[A-Z][A-Z0-9-]*-\d{3}$/u;
const placeholderPattern = /^(?:not implemented|not verified)$/iu;

export function extractM2TableIds(document: string): string[] {
  return Array.from(
    document.matchAll(/^\|\s*([A-Z][A-Z0-9-]*-\d{3})\s*\|/gmu),
    (match) => match[1]!,
  );
}

function splitMarkdownRow(line: string): string[] {
  if (!line.startsWith("|") || !line.endsWith("|")) return [];

  const cells: string[] = [];
  let current = "";
  for (let index = 1; index < line.length - 1; index += 1) {
    const character = line[index]!;
    if (character === "|" && line[index - 1] !== "\\") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  cells.push(current.trim());
  return cells;
}

function parseTraceabilityRows(document: string): TraceabilityRow[] {
  return document.split("\n").flatMap((line) => {
    const cells = splitMarkdownRow(line.trim());
    if (cells.length === 0 || !requirementIdPattern.test(cells[0] ?? "")) return [];
    if (cells.length !== 4) {
      throw new Error(`M2 traceability row ${cells[0]} must contain exactly four columns.`);
    }
    return [
      {
        id: cells[0]!,
        implementation: cells[1]!,
        validation: cells[2]!,
        status: cells[3]!,
      },
    ];
  });
}

function assertExactIdSet(label: string, actual: string[], expected: string[]): void {
  if (actual.length !== expected.length) {
    throw new Error(`${label} has ${actual.length} rows; expected ${expected.length}.`);
  }
  if (new Set(actual).size !== actual.length) {
    throw new Error(`${label} contains duplicate requirement IDs.`);
  }
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  const mismatch = sortedActual.find((id, index) => id !== sortedExpected[index]);
  if (mismatch) throw new Error(`${label} does not match the M2 requirement manifest.`);
}

export function checkM2Traceability({
  manifest,
  requirementsDocument,
  traceabilityDocument,
  mode,
}: M2TraceabilityCheckInput): M2TraceabilityCheckResult {
  const manifestIds = manifest.requirements.map(({ id }) => id);
  if (manifest.count !== 543 || manifestIds.length !== 543) {
    throw new Error("M2 manifest must contain exactly 543 requirements.");
  }
  if (new Set(manifestIds).size !== manifestIds.length) {
    throw new Error("M2 manifest contains duplicate requirement IDs.");
  }

  assertExactIdSet(
    "M2 requirements document",
    extractM2TableIds(requirementsDocument),
    manifestIds,
  );
  const rows = parseTraceabilityRows(traceabilityDocument);
  assertExactIdSet(
    "M2 traceability document",
    rows.map(({ id }) => id),
    manifestIds,
  );

  const allowedBlocked = new Set(M2_DEVELOPMENT_BLOCKER_IDS);
  let passed = 0;
  let blocked = 0;

  for (const row of rows) {
    if (!(["PASS", "FAIL", "BLOCKED"] as string[]).includes(row.status)) {
      throw new Error(`${row.id} has invalid traceability status ${row.status}.`);
    }
    if (mode === "final" && row.status !== "PASS") {
      throw new Error(`${row.id} must be PASS for final M2 verification; found ${row.status}.`);
    }
    if (mode === "development" && row.status === "FAIL") {
      throw new Error(`${row.id} must not remain FAIL in M2 development CI.`);
    }
    if (row.status === "BLOCKED" && !allowedBlocked.has(row.id)) {
      throw new Error(`${row.id} is not an approved post-merge production/operator blocker.`);
    }
    if (
      placeholderPattern.test(row.implementation) ||
      placeholderPattern.test(row.validation) ||
      row.implementation.length === 0 ||
      row.validation.length === 0
    ) {
      throw new Error(`${row.id} lacks concrete implementation or validation evidence.`);
    }

    if (row.status === "PASS") {
      passed += 1;
      continue;
    }
    blocked += 1;
  }

  return { total: rows.length, passed, blocked };
}
