import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexCliProvider } from "../src/runtime/codex-cli-provider";
import { readPrivate } from "./contract-pilot/files";
import { preparePilot, type PreparedPilot } from "./contract-pilot/input";
import { opusReader } from "./contract-pilot/reader";
import { runContractPilot, type PilotReader } from "./contract-pilot/run";

import { AUTHORITY_END, PILOT_DURATION_MS, safePilotCode } from "./contract-pilot/policy";

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
  // Tek çalışma kimliği: cwd/config/çıktı yolu değişikliği yeni bütçe açmaz. Reset seçeneği yok.
  const directory = path.join(os.homedir(), "style-lab", "p345-kisa-pilot-20261004", "execution");
  let provider: CodexCliProvider | undefined;
  let reader: PilotReader | undefined;
  let readerDirectory: string | undefined;
  const getProvider = () => {
    if (!current) throw new Error("PILOT_NOT_PREPARED");
    return (provider ??= new CodexCliProvider({
      ...current.config.codex,
      runtimeHome: path.join(directory, "codex-home"),
      workRoot: path.join(directory, "codex-work"),
    }));
  };
  const getReader = () => {
    if (!current) throw new Error("PILOT_NOT_PREPARED");
    readerDirectory ??= mkdtempSync(path.join(os.tmpdir(), "agentsozluk-contract-reader-"));
    return (reader ??= opusReader(
      current.config.readerExecutable,
      readerDirectory,
      current.config.readerVersion,
    ));
  };
  try {
    if (!mode) {
      const ready = prepare();
      if (Date.now() + PILOT_DURATION_MS > AUTHORITY_END)
        throw new Error("PILOT_START_WINDOW_TOO_SHORT");
      await getReader().inspect();
      const inspected = await getProvider().inspect();
      if (
        !inspected.supportsStructuredOutput ||
        inspected.version !== ready.config.providerVersion ||
        inspected.model !== ready.config.model ||
        inspected.reasoningEffort !== ready.config.reasoningEffort
      )
        throw new Error("PILOT_PROVIDER_FINGERPRINT_CHANGED");
      process.stdout.write(
        JSON.stringify({ status: "PREFLIGHT_ONLY", inputs: ready.inputs.length, calls: 0 }) + "\n",
      );
      return;
    }
    const result = await runContractPilot({
      directory,
      prepare,
      provider: {
        inspect: () => getProvider().inspect(),
        invoke: (request) => getProvider().invoke(request),
      },
      reader: {
        inspect: () => getReader().inspect(),
        invoke: (packet, timeoutMs) => getReader().invoke(packet, timeoutMs),
      },
    });
    process.stdout.write(JSON.stringify(result) + "\n");
  } finally {
    if (readerDirectory) rmSync(readerDirectory, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  const code = safePilotCode(error, "PILOT_INVALID_INPUT_OR_IO");
  process.stderr.write(code + "\n");
  process.exitCode = 1;
});
