import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z, ZodError } from "zod";
import {
  capabilityBenchmarkDiagnosticsSchema,
  createCapabilityBenchmarkDiagnosticCollector,
  safeBenchmarkZodIssues,
  writeCapabilityBenchmarkDiagnostics,
} from "@/runtime/capability-diagnostics";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("capacity benchmark safe diagnostics", () => {
  it("retains only bounded Zod codes and sanitized paths", () => {
    const rawSecret = "RAW_SECRET_VALUE_MUST_NOT_LEAK";
    const parsed = z
      .object({ state: z.object({ curiosity: z.number() }) })
      .safeParse({ state: { curiosity: rawSecret } });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("Expected invalid fixture.");

    const issues = safeBenchmarkZodIssues(parsed.error);
    expect(issues).toContainEqual({ code: "INVALID_TYPE", path: "$.state.curiosity" });
    expect(JSON.stringify(issues)).not.toContain(rawSecret);

    const hostile = new ZodError([
      {
        code: "custom",
        path: ["unsafe<script>", 100_000, "safeField"],
        message: rawSecret,
      },
    ]);
    expect(safeBenchmarkZodIssues(hostile)).toEqual([{ code: "CUSTOM", path: "$[*][*][*]" }]);
    expect(JSON.stringify(safeBenchmarkZodIssues(hostile))).not.toContain(rawSecret);

    const dynamicKey = new ZodError([
      { code: "custom", path: ["state", rawSecret], message: rawSecret },
    ]);
    expect(safeBenchmarkZodIssues(dynamicKey)).toEqual([{ code: "CUSTOM", path: "$.state[*]" }]);
    expect(JSON.stringify(safeBenchmarkZodIssues(dynamicKey))).not.toContain(rawSecret);
  });

  it("writes a strict create-exclusive mode-0600 sidecar", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "agent-capability-diagnostics-"));
    temporaryRoots.push(root);
    const outputPath = path.join(root, "capacity-cold.diagnostics.json");
    const collector = createCapabilityBenchmarkDiagnosticCollector("capacity");
    collector.record({
      scenario: "short-topic-context",
      lane: null,
      finalStatus: "FAIL",
      repairAttempted: true,
      stages: [
        {
          stage: "DECISION_PRIMARY",
          outcome: "SCHEMA_INVALID",
          safeCode: "CODEX_DECISION_OUTPUT_INVALID",
          issues: [{ code: "INVALID_TYPE", path: "$.state.curiosity" }],
        },
        {
          stage: "DECISION_REPAIR",
          outcome: "SCHEMA_INVALID",
          safeCode: "CODEX_DECISION_OUTPUT_INVALID",
          issues: [{ code: "INVALID_TYPE", path: "$.state.curiosity" }],
        },
      ],
    });
    const document = collector.document("BENCHMARK_COMPLETED");

    expect(() =>
      capabilityBenchmarkDiagnosticsSchema.parse({
        ...document,
        scenarios: [{ ...document.scenarios[0], finalStatus: "PASS" }],
      }),
    ).toThrow(/final status/iu);

    const rawSecret = "RAW_DYNAMIC_FIELD_MUST_NOT_LEAK";
    const unsafeDocument = {
      ...document,
      scenarios: [
        {
          ...document.scenarios[0],
          stages: [
            {
              ...document.scenarios[0]?.stages[0],
              issues: [{ code: "CUSTOM", path: `$.state.${rawSecret}` }],
            },
            document.scenarios[0]?.stages[1],
          ],
        },
      ],
    };
    expect(() => capabilityBenchmarkDiagnosticsSchema.parse(unsafeDocument)).toThrow(
      /allowlisted/iu,
    );
    await expect(
      writeCapabilityBenchmarkDiagnostics(
        path.join(root, "unsafe.diagnostics.json"),
        unsafeDocument as unknown as Parameters<typeof writeCapabilityBenchmarkDiagnostics>[1],
      ),
    ).rejects.toThrow(/allowlisted/iu);

    await writeCapabilityBenchmarkDiagnostics(outputPath, document);
    expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
    expect(
      capabilityBenchmarkDiagnosticsSchema.parse(JSON.parse(await readFile(outputPath, "utf8"))),
    ).toEqual(document);
    await expect(writeCapabilityBenchmarkDiagnostics(outputPath, document)).rejects.toMatchObject({
      code: "EEXIST",
    });

    const symlinkTarget = path.join(root, "must-remain-unchanged");
    const symlinkPath = path.join(root, "linked.diagnostics.json");
    await writeFile(symlinkTarget, "UNCHANGED", { mode: 0o600 });
    await symlink(symlinkTarget, symlinkPath);
    await expect(writeCapabilityBenchmarkDiagnostics(symlinkPath, document)).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(await readFile(symlinkTarget, "utf8")).toBe("UNCHANGED");
  });
});
