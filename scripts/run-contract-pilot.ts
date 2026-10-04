import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexCliProvider } from "../src/runtime/codex-cli-provider";
import { readPrivate } from "./contract-pilot/files";
import { preparePilot, type PreparedPilot } from "./contract-pilot/input";
import { opusReader } from "./contract-pilot/reader";
import { runContractPilot } from "./contract-pilot/run";

async function main() {
  const [configFile, mode, ...extra] = process.argv.slice(2);
  if (!configFile || !path.isAbsolute(configFile) || extra.length || (mode && mode !== "--execute"))
    throw new Error("PILOT_USAGE_ABSOLUTE_CONFIG_OPTIONAL_EXECUTE");
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: repository,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  let current: PreparedPilot | undefined;
  const prepare = () => {
    if (
      git(
        "status",
        "--porcelain",
        "--",
        "src",
        "scripts",
        "prisma",
        "package.json",
        "pnpm-lock.yaml",
        "tsconfig.json",
      )
    )
      throw new Error("PILOT_PRODUCT_TREE_DIRTY");
    current = preparePilot(readPrivate(configFile), git("rev-parse", "HEAD"), Date.now());
    return current;
  };
  if (!mode) {
    const ready = prepare();
    process.stdout.write(
      JSON.stringify({ status: "PREFLIGHT_ONLY", inputs: ready.inputs.length, calls: 0 }) + "\n",
    );
    return;
  }
  // Tek çalışma kimliği: cwd/config/çıktı yolu değişikliği yeni bütçe açmaz. Reset seçeneği yok.
  const directory = path.join(os.homedir(), "style-lab", "p345-kisa-pilot-20261004", "execution");
  let provider: CodexCliProvider | undefined;
  const result = await runContractPilot({
    directory,
    prepare,
    provider: {
      async inspect() {
        if (!current) throw new Error("PILOT_NOT_PREPARED");
        provider = new CodexCliProvider({
          ...current.config.codex,
          runtimeHome: path.join(directory, "codex-home"),
          workRoot: path.join(directory, "codex-work"),
        });
        return provider.inspect();
      },
      async invoke(request) {
        if (!provider) throw new Error("PILOT_NOT_PREPARED");
        return provider.invoke(request);
      },
    },
    reader: {
      async invoke(packet, timeoutMs) {
        if (!current) throw new Error("PILOT_NOT_PREPARED");
        const readerDirectory = path.join(directory, "reader");
        mkdirSync(readerDirectory, { mode: 0o700 });
        return opusReader(
          current.config.readerExecutable,
          readerDirectory,
          current.config.readerVersion,
        ).invoke(packet, timeoutMs);
      },
    },
  });
  process.stdout.write(JSON.stringify(result) + "\n");
}

void main().catch((error: unknown) => {
  const code =
    error instanceof Error && /^PILOT_[A-Z0-9_]+$/u.test(error.message)
      ? error.message
      : "PILOT_INVALID_INPUT_OR_IO";
  process.stderr.write(code + "\n");
  process.exitCode = 1;
});
