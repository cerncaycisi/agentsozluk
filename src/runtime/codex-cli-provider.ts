import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { chmod, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "@/lib/http/errors";
import type {
  RuntimeProvider,
  RuntimeProviderRequest,
  RuntimeProviderResult,
} from "@/runtime/provider";

interface CodexCliProviderOptions {
  executable: string;
  runtimeHome: string;
  workRoot: string;
  retainWorkHours?: number;
  spawnProcess?: typeof spawn;
}

function safeEnvironment(runtimeHome: string, workDirectory: string): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: runtimeHome,
    CODEX_HOME: runtimeHome,
    TMPDIR: workDirectory,
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    NO_COLOR: "1",
  };
}

async function cleanupExpiredWork(workRoot: string, retainWorkHours: number): Promise<void> {
  if (retainWorkHours === 0) return;
  const cutoff = Date.now() - retainWorkHours * 60 * 60 * 1000;
  for (const entry of await readdir(workRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = path.join(workRoot, entry.name);
    if ((await stat(target)).mtimeMs < cutoff) await rm(target, { recursive: true, force: true });
  }
}

function collect(
  child: ChildProcessWithoutNullStreams,
  input: string,
  timeoutMs: number,
): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 16_384) stderr += chunk.toString("utf8").slice(0, 16_384 - stderr.length);
    });
    child.stdout.resume();
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => finish(() => resolve({ exitCode: code ?? 1, stderr })));
    child.stdin.end(input);
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 5000).unref();
    }, timeoutMs);
    timeout.unref();
  });
}

export class CodexCliProvider implements RuntimeProvider {
  readonly #options: CodexCliProviderOptions;

  constructor(options: CodexCliProviderOptions) {
    if ((options.retainWorkHours ?? 0) < 0 || (options.retainWorkHours ?? 0) > 24) {
      throw new Error("Runtime debug retention 0–24 saat aralığında olmalıdır.");
    }
    this.#options = options;
  }

  async #inspectCommand(args: string[]): Promise<string> {
    await Promise.all([
      mkdir(this.#options.runtimeHome, { recursive: true, mode: 0o700 }),
      mkdir(this.#options.workRoot, { recursive: true, mode: 0o700 }),
    ]);
    const child = (this.#options.spawnProcess ?? spawn)(this.#options.executable, args, {
      shell: false,
      env: safeEnvironment(this.#options.runtimeHome, this.#options.workRoot),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    const result = await collect(child, "", 10_000);
    if (result.exitCode !== 0) throw new AppError("INTERNAL_ERROR", 500, "Codex CLI incelenemedi.");
    return stdout.trim();
  }

  async inspect(): Promise<{ version: string; supportsStructuredOutput: boolean }> {
    const [version, help] = await Promise.all([
      this.#inspectCommand(["--version"]),
      this.#inspectCommand(["exec", "--help"]),
    ]);
    return {
      version,
      supportsStructuredOutput:
        help.includes("--output-schema") && help.includes("--output-last-message"),
    };
  }

  async invoke(request: RuntimeProviderRequest): Promise<RuntimeProviderResult> {
    const startedAt = Date.now();
    const workDirectory = path.join(this.#options.workRoot, request.runId);
    const schemaPath = path.join(workDirectory, "output.schema.json");
    const outputPath = path.join(workDirectory, "output.json");
    await Promise.all([
      mkdir(this.#options.runtimeHome, { recursive: true, mode: 0o700 }),
      mkdir(this.#options.workRoot, { recursive: true, mode: 0o700 }),
    ]);
    await cleanupExpiredWork(this.#options.workRoot, this.#options.retainWorkHours ?? 0);
    await mkdir(workDirectory, { recursive: false, mode: 0o700 });
    await writeFile(schemaPath, JSON.stringify(request.outputSchema), { mode: 0o600, flag: "wx" });
    await chmod(schemaPath, 0o600);
    try {
      const inspected = await this.inspect();
      if (!inspected.supportsStructuredOutput) {
        throw new AppError("INTERNAL_ERROR", 500, "Codex CLI structured output desteklemiyor.");
      }
      const args = [
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--ask-for-approval",
        "never",
        "--output-schema",
        schemaPath,
        "--output-last-message",
        outputPath,
        "-",
      ];
      const child = (this.#options.spawnProcess ?? spawn)(this.#options.executable, args, {
        cwd: workDirectory,
        shell: false,
        env: safeEnvironment(this.#options.runtimeHome, workDirectory),
        stdio: ["pipe", "pipe", "pipe"],
      });
      const result = await collect(child, request.prompt, request.timeoutMs);
      if (result.exitCode !== 0) {
        throw new AppError("INTERNAL_ERROR", 500, "Codex CLI run güvenli biçimde tamamlanamadı.");
      }
      const output = JSON.parse(await readFile(outputPath, "utf8")) as unknown;
      return {
        provider: "codex-cli",
        version: inspected.version,
        output,
        durationMs: Date.now() - startedAt,
      };
    } finally {
      if (!this.#options.retainWorkHours) await rm(workDirectory, { recursive: true, force: true });
    }
  }
}
