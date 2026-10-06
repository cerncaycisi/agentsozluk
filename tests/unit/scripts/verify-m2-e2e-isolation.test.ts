import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

const originalArguments = process.argv;
const originalExitCode = process.exitCode;
let immutableCommit: boolean;
let failCleanup: boolean;
let commandHistory: string[][];
let commandEnvironments: (NodeJS.ProcessEnv | undefined)[];

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("TEST_DATABASE_URL", "postgresql://fixture@127.0.0.1:5432/m2_isolation_test");
  vi.stubEnv("DATABASE_URL", "postgresql://fixture@127.0.0.1:5432/agent_sozluk");
  vi.stubEnv("E2E_APP_URL", "http://127.0.0.1:3000");
  vi.stubEnv("npm_execpath", "/fixture/pnpm.cjs");
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  process.exitCode = 0;
  immutableCommit = false;
  failCleanup = false;
  commandHistory = [];
  commandEnvironments = [];
  vi.mocked(spawnSync).mockImplementation((_command, args, options) => {
    const command = Array.isArray(args) ? args.slice(1) : [];
    commandHistory.push(command);
    commandEnvironments.push(options?.env);
    let status = 0;
    // M1'in 410 E2E journal'ı integration/simulation temizliğinde korunur.
    // Gerçek admission CLI, mirror yokken bu durumu reddeder.
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
      expect(commandHistory[e2e - 1]).toEqual([
        "exec",
        "prisma",
        "migrate",
        "reset",
        "--force",
        "--skip-seed",
      ]);
      expect(commandEnvironments[e2e - 1]).toMatchObject({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://fixture@127.0.0.1:5432/m2_isolation_test",
        TEST_DATABASE_URL: "postgresql://fixture@127.0.0.1:5432/m2_isolation_test",
      });
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
