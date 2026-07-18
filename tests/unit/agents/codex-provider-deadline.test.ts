import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexCliProvider } from "@/runtime/codex-cli-provider";
import { RuntimeProviderTimeoutError } from "@/runtime/provider";

const temporaryRoots: string[] = [];

function hangingChild(killSignals: NodeJS.Signals[]): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    pid: number;
    kill: (signal?: NodeJS.Signals | number) => boolean;
  };
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = process.pid;
  child.kill = (signal = "SIGTERM") => {
    if (typeof signal === "string") killSignals.push(signal);
    setImmediate(() => child.emit("close", null));
    return true;
  };
  return child as unknown as ChildProcessWithoutNullStreams;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Codex CLI provider absolute deadline", () => {
  it("charges CLI inspection to the same invocation budget and terminates it gracefully", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "agent-sozluk-provider-deadline-"));
    temporaryRoots.push(root);
    const killSignals: NodeJS.Signals[] = [];
    const spawnMock = vi.fn(
      (...spawnArguments: [command: string, arguments_?: readonly string[], options?: unknown]) => {
        void spawnArguments;
        return hangingChild(killSignals);
      },
    );
    const spawnProcess = spawnMock as unknown as typeof spawn;
    const credentialFile = "/var/lib/agent-sozluk-runtime/credentials.json";
    const sandboxExecutable = "/usr/bin/bwrap";
    const provider = new CodexCliProvider({
      executable: "/usr/bin/false",
      sandboxExecutable,
      credentialFile,
      runtimeHome: path.join(root, "home"),
      workRoot: path.join(root, "work"),
      spawnProcess,
    });

    await expect(
      provider.invoke({
        runId: "00000000-0000-4000-8000-000000000001",
        prompt: "deadline test",
        outputSchema: { type: "object" },
        timeoutMs: 25,
        debugRetentionHours: 0,
      }),
    ).rejects.toBeInstanceOf(RuntimeProviderTimeoutError);

    expect(spawnProcess).toHaveBeenCalledTimes(3);
    expect(killSignals).toEqual(["SIGTERM", "SIGTERM", "SIGTERM"]);
    for (const [command, rawArguments, rawOptions] of spawnMock.mock.calls) {
      const arguments_ = rawArguments as readonly string[];
      const options = rawOptions as {
        cwd?: string;
        detached?: boolean;
        env?: NodeJS.ProcessEnv;
        shell?: boolean;
      };
      expect(command).toBe(sandboxExecutable);
      expect(arguments_).toEqual(
        expect.arrayContaining([
          "--unshare-user",
          "--unshare-pid",
          "--ro-bind",
          "--tmpfs",
          path.dirname(credentialFile),
          "--clearenv",
          "--chdir",
          path.join(root, "work"),
          "--",
          "/usr/bin/false",
        ]),
      );
      expect(arguments_).not.toContain(credentialFile);
      expect(options).toMatchObject({
        cwd: path.join(root, "work"),
        detached: true,
        shell: false,
      });
      expect(Object.keys(options.env ?? {}).sort()).toEqual(
        ["CODEX_HOME", "HOME", "LANG", "LC_ALL", "NODE_ENV", "NO_COLOR", "PATH", "TMPDIR"].sort(),
      );
    }
  });
});
