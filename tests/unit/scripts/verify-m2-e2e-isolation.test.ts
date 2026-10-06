import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

const originalArguments = process.argv;
const originalExitCode = process.exitCode;
let immutableCommit: boolean;
let failCleanup: boolean;
let commandHistory: string[][];

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("TEST_DATABASE_URL", "postgresql://fixture@127.0.0.1:5432/m2_isolation_test");
  vi.stubEnv("E2E_APP_URL", "http://127.0.0.1:3000");
  vi.stubEnv("npm_execpath", "/fixture/pnpm.cjs");
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  process.exitCode = 0;
  immutableCommit = false;
  failCleanup = false;
  commandHistory = [];
  vi.mocked(spawnSync).mockImplementation((_command, args) => {
    const command = Array.isArray(args) ? args.slice(1) : [];
    commandHistory.push(command);
    let status = 0;
    // M1's 410 E2E creates a committed journal; integration/simulation cleanup
    // cannot erase it. The real admission CLI rejects that state without a mirror.
    if (command[0] === "verify:m1") immutableCommit = true;
    if (command.includes("reset")) {
      if (immutableCommit && failCleanup) status = 2;
      else immutableCommit = false;
    }
    if (command[0] === "test:agent-e2e" && immutableCommit) status = 1;
    return {
      pid: 1,
      output: [],
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
      status,
      signal: null,
    };
  });
});

afterEach(() => {
  process.argv = originalArguments;
  process.exitCode = originalExitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("M2 verification isolates successive production-server E2E runs", () => {
  it.each([false, true])(
    "clears immutable M1 fixtures before agent E2E (development=%s)",
    async (development) => {
      process.argv = [process.execPath, "verify-m2.ts", ...(development ? ["--development"] : [])];
      await import("../../../scripts/verify-m2");
      expect(process.exitCode).toBe(0);
      const m1 = commandHistory.findIndex(([command]) => command === "verify:m1");
      const e2e = commandHistory.findIndex(([command]) => command === "test:agent-e2e");
      expect(m1).toBeGreaterThanOrEqual(0);
      expect(e2e).toBeGreaterThan(m1);
      expect(commandHistory.slice(m1 + 1, e2e)).toContainEqual([
        "exec",
        "prisma",
        "migrate",
        "reset",
        "--force",
        "--skip-seed",
      ]);
      expect(commandHistory.at(-1)).toEqual([
        development ? "requirements:m2:check:development" : "requirements:m2:check",
      ]);
    },
  );

  it("stops before agent E2E if the isolated database cannot be recreated", async () => {
    process.argv = [process.execPath, "verify-m2.ts", "--development"];
    failCleanup = true;
    await import("../../../scripts/verify-m2");
    expect(process.exitCode).toBe(1);
    expect(commandHistory.some(([command]) => command === "test:agent-e2e")).toBe(false);
    expect(
      commandHistory.some(([command]) => command === "requirements:m2:check:development"),
    ).toBe(false);
  });

  it("rejects a production database before invoking any command", async () => {
    process.argv = [process.execPath, "verify-m2.ts"];
    vi.stubEnv("TEST_DATABASE_URL", "postgresql://fixture@127.0.0.1:5432/agent_sozluk");
    await expect(import("../../../scripts/verify-m2")).rejects.toThrow("refuses to mutate");
    expect(commandHistory).toEqual([]);
  });
});
