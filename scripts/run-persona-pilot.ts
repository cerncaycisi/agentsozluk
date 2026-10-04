import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexCliProvider } from "../src/runtime/codex-cli-provider";
import { readPrivate } from "./contract-pilot/files";
import {
  preparePersonaPilot,
  type PreparedPersonaPilot,
  type PersonaPhase,
} from "./persona-pilot/input";
import { opusReader } from "./contract-pilot/reader";
import type { PilotReader } from "./contract-pilot/run";
import { runPersonaPilot } from "./persona-pilot/run";
import { PERSONA_READER_SYSTEM } from "./persona-pilot/review";

import { AUTHORITY_END, PILOT_DURATION_MS, safePilotCode } from "./contract-pilot/policy";

async function main() {
  const [configFile, mode, phase, reviewFile, ...extra] = process.argv.slice(2);
  if (
    !configFile ||
    !path.isAbsolute(configFile) ||
    extra.length ||
    (mode !== undefined && mode !== "--execute" && mode !== "--review") ||
    (mode !== "--review" && (phase || reviewFile)) ||
    (mode === "--review" &&
      (!["development", "holdout"].includes(phase ?? "") ||
        !reviewFile ||
        !path.isAbsolute(reviewFile)))
  )
    throw new Error("PILOT_USAGE_CONFIG_EXECUTE_OR_REVIEW_PHASE_FILE");
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: repository,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  let current: PreparedPersonaPilot | undefined;
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
    current = preparePersonaPilot(readPrivate(configFile), git("rev-parse", "HEAD"), Date.now());
    return current;
  };
  // Tek çalışma kimliği: cwd/config/çıktı yolu değişikliği yeni bütçe açmaz. Reset seçeneği yok.
  const directory = path.join(os.homedir(), "style-lab", "p2-pilot-hazirlik-20261004", "execution");
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
    readerDirectory ??= mkdtempSync(path.join(os.tmpdir(), "agentsozluk-persona-reader-"));
    return (reader ??= opusReader(
      current.config.readerExecutable,
      readerDirectory,
      current.config.readerVersion,
      PERSONA_READER_SYSTEM,
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
        JSON.stringify({ status: "PREFLIGHT_ONLY", pairs: ready.pairs.length, calls: 0 }) + "\n",
      );
      return;
    }
    const result = await runPersonaPilot({
      ...(mode === "--review"
        ? { review: { phase: phase as PersonaPhase, value: JSON.parse(readPrivate(reviewFile!)) } }
        : {}),
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
