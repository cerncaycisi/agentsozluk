import { readFileSync } from "node:fs";
import path from "node:path";
import {
  checkM2Traceability,
  type RequirementManifest,
  type SupersessionManifest,
} from "./m2-traceability-policy";

function main(): void {
  const root = process.cwd();
  const manifest = JSON.parse(
    readFileSync(path.join(root, "docs/m2-requirements.json"), "utf8"),
  ) as RequirementManifest;
  const result = checkM2Traceability({
    manifest,
    requirementsDocument: readFileSync(path.join(root, "docs/M2_REQUIREMENTS.md"), "utf8"),
    traceabilityDocument: readFileSync(path.join(root, "docs/M2_TRACEABILITY.md"), "utf8"),
    supersessions: JSON.parse(
      readFileSync(path.join(root, "docs/m2-superseded-requirements.json"), "utf8"),
    ) as SupersessionManifest,
    mode: "development",
  });

  process.stdout.write(
    `M2 development traceability passed: ${result.passed} active PASS, ${result.superseded} ADR-012 superseded, ${result.partiallySuperseded} partial supersessions, ${result.blocked} approved post-merge BLOCKED, 0 FAIL (${result.total} total).\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "M2 development traceability failed."}\n`,
  );
  process.exitCode = 1;
}
