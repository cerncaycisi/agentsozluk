import { spawn, type ChildProcess } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { lstat, mkdir, open, readdir, rmdir, unlink, type FileHandle } from "node:fs/promises";
import path from "node:path";

/*
  Gemini CLI (`agy 1.5.18`) her çağrıda `HOME/.gemini/antigravity-cli` altında konuşma SQLite
  dosyaları, brain klasörleri, CLI logları ve özet veritabanı biriktirir. Altı geçici alt dizin
  Bubblewrap `--size ... --tmpfs` ile bellek içinde tutulur; konak diskinde oluşabilecek özet
  SQLite dosyaları ve artık dizin girdileri ise sabitlenmiş fd (`/proc/self/fd/<fd>`, O_NOFOLLOW)
  üzerinden ve gerçek Linux `flock(1)` süreçler arası kilidi altında temizlenir. Kimlik
  dosyalarına (`antigravity-oauth-token`, `installation_id`, `jetski_state.pbtxt`, `builtin/`,
  `cache/`, `updater/`) ve `.agentsozluk-home.lock` kilidine dokunulmaz.
*/

export const GEMINI_EPHEMERAL_STATE_DIRS = [
  ["conversations", 64 * 1024 * 1024],
  ["brain", 64 * 1024 * 1024],
  ["log", 64 * 1024 * 1024],
  ["presence", 16 * 1024 * 1024],
  ["implicit", 16 * 1024 * 1024],
  ["crashes", 16 * 1024 * 1024],
] as const;

export const GEMINI_PRUNABLE_STATE_FILES = [
  "conversation_summaries.db",
  "conversation_summaries.db-wal",
  "conversation_summaries.db-shm",
  "jetbox_summaries_proto.pb",
  "cli.log",
] as const;

export const GEMINI_HOME_LOCK_FILENAME = ".agentsozluk-home.lock";
export const DEFAULT_GEMINI_SOFT_THRESHOLD_BYTES = 16 * 1024 * 1024;
export const DEFAULT_GEMINI_HARD_THRESHOLD_BYTES = 64 * 1024 * 1024;
export const DEFAULT_GEMINI_MIN_CHECK_INTERVAL_MS = 5 * 60_000;
const DEFAULT_EXCLUSIVE_LOCK_TIMEOUT_MS = 30_000;
const MAX_REMOVE_DEPTH = 32;

const DIR_OPEN_FLAGS = fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW;
const LOCK_OPEN_FLAGS =
  fsConstants.O_CREAT | fsConstants.O_RDWR | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK;

export interface GeminiHomeInspection {
  totalBytes: number;
  fileBytes: number;
  ephemeralEntries: number;
  hasEphemeralEntries: boolean;
  unsafeLayout: boolean;
}

export interface PruneGeminiHomeResult {
  pruned: boolean;
  reason:
    | "pruned"
    | "interval"
    | "below_threshold"
    | "deferred_until_idle"
    | "lock_busy"
    | "partial_failure"
    | "unsafe_layout";
  deletedBytes: number;
  deletedFiles: number;
  deletedEntries: number;
  failedCount: number;
  errorCodes: string[];
}

export interface GeminiHomePruneOptions {
  force?: boolean;
  softThresholdBytes?: number;
  hardThresholdBytes?: number;
  minCheckIntervalMs?: number;
  exclusiveTimeoutMs?: number;
}

export interface GeminiHomeSharedAccessOptions {
  signal?: AbortSignal | undefined;
  deadlineAtMs?: number | undefined;
  onCancel?: (() => Error) | undefined;
  onTimeout?: (() => Error) | undefined;
}

export interface GeminiCrossProcessLockHandle {
  release: () => Promise<void>;
}

export type GeminiExclusiveLockAcquisition =
  | { status: "acquired"; handle: GeminiCrossProcessLockHandle }
  | { status: "busy" }
  | { status: "missing" }
  | { status: "unsafe_layout" }
  | { status: "error"; errorCode: string };

export interface GeminiCrossProcessLock {
  acquireShared(
    configHome: string,
    options?: GeminiHomeSharedAccessOptions,
  ): Promise<GeminiCrossProcessLockHandle>;
  acquireExclusive(
    configHome: string,
    options?: { nonBlocking?: boolean; timeoutMs?: number },
  ): Promise<GeminiExclusiveLockAcquisition>;
}

function errorCodeOf(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return typeof code === "string" && code.length > 0 ? code : "EIO";
}

function isSymlinkOrNotDirError(code: string): boolean {
  return code === "ELOOP" || code === "ENOTDIR";
}

async function openDirectoryNoFollow(dirPath: string): Promise<FileHandle> {
  return open(dirPath, DIR_OPEN_FLAGS);
}

async function ensureChildDirectoryNoFollow(
  parentFd: number,
  name: string,
  label: string,
): Promise<FileHandle> {
  const targetPath = `/proc/self/fd/${parentFd}/${name}`;
  try {
    return await openDirectoryNoFollow(targetPath);
  } catch (error) {
    const code = errorCodeOf(error);
    if (isSymlinkOrNotDirError(code)) {
      throw new Error(`${label} sembolik bağ veya dosya olamaz.`);
    }
    if (code !== "ENOENT") throw error;
  }
  try {
    await mkdir(targetPath, { mode: 0o700 });
  } catch (error) {
    if (errorCodeOf(error) !== "EEXIST") throw error;
  }
  try {
    return await openDirectoryNoFollow(targetPath);
  } catch (error) {
    if (isSymlinkOrNotDirError(errorCodeOf(error))) {
      throw new Error(`${label} sembolik bağ veya dosya olamaz.`);
    }
    throw error;
  }
}

async function ensureRootDirectoryNoFollow(dirPath: string, label: string): Promise<FileHandle> {
  try {
    return await openDirectoryNoFollow(dirPath);
  } catch (error) {
    const code = errorCodeOf(error);
    if (isSymlinkOrNotDirError(code)) {
      throw new Error(`${label} sembolik bağ veya dosya olamaz.`);
    }
    if (code !== "ENOENT") throw error;
  }
  try {
    await mkdir(dirPath, { mode: 0o700 });
  } catch (error) {
    if (errorCodeOf(error) !== "EEXIST") throw error;
  }
  try {
    return await openDirectoryNoFollow(dirPath);
  } catch (error) {
    if (isSymlinkOrNotDirError(errorCodeOf(error))) {
      throw new Error(`${label} sembolik bağ veya dosya olamaz.`);
    }
    throw error;
  }
}

/**
 * Konfigürasyon kökünden başlayarak `agy` özel ajan bağlama noktasını ve 6 geçici tmpfs
 * bağlama dizinini sabitlenmiş fd + O_NOFOLLOW ile sembolik bağlara izin vermeden doğrular.
 */
export async function prepareGeminiEphemeralMountPoints(
  canonicalConfigHome: string,
): Promise<void> {
  if (!path.isAbsolute(canonicalConfigHome)) {
    throw new Error("Gemini config home mutlak olmalıdır.");
  }
  const homeFd = await ensureRootDirectoryNoFollow(canonicalConfigHome, "Gemini config home");
  try {
    const geminiFd = await ensureChildDirectoryNoFollow(
      homeFd.fd,
      ".gemini",
      "Gemini durum dizini",
    );
    try {
      const configFd = await ensureChildDirectoryNoFollow(
        geminiFd.fd,
        "config",
        "Gemini yapılandırma dizini",
      );
      try {
        const agentsFd = await ensureChildDirectoryNoFollow(
          configFd.fd,
          "agents",
          "Gemini ajan dizini",
        );
        await agentsFd.close();
      } finally {
        await configFd.close();
      }

      const cliFd = await ensureChildDirectoryNoFollow(
        geminiFd.fd,
        "antigravity-cli",
        "Gemini CLI durum dizini",
      );
      try {
        for (const [name] of GEMINI_EPHEMERAL_STATE_DIRS) {
          const subFd = await ensureChildDirectoryNoFollow(
            cliFd.fd,
            name,
            `Gemini geçici dizini (${name})`,
          );
          await subFd.close();
        }
      } finally {
        await cliFd.close();
      }
    } finally {
      await geminiFd.close();
    }
  } finally {
    await homeFd.close();
  }
}

/** `bwrap` için 6 geçici `antigravity-cli` alt dizinine boyut sınırlı `--tmpfs` argümanları üretir. */
export function geminiEphemeralTmpfsArgs(canonicalConfigHome: string): string[] {
  const cliDir = path.join(canonicalConfigHome, ".gemini", "antigravity-cli");
  return GEMINI_EPHEMERAL_STATE_DIRS.flatMap(([name, sizeBytes]) => [
    "--size",
    String(sizeBytes),
    "--tmpfs",
    path.join(cliDir, name),
  ]);
}

async function openSafeCliDirectoryHandle(canonicalConfigHome: string): Promise<{
  cliFd: FileHandle | null;
  unsafeLayout: boolean;
  errorCode: string | null;
}> {
  let homeFd: FileHandle | undefined;
  let geminiFd: FileHandle | undefined;
  try {
    homeFd = await openDirectoryNoFollow(canonicalConfigHome);
    geminiFd = await openDirectoryNoFollow(`/proc/self/fd/${homeFd.fd}/.gemini`);
    const cliFd = await openDirectoryNoFollow(`/proc/self/fd/${geminiFd.fd}/antigravity-cli`);
    return { cliFd, unsafeLayout: false, errorCode: null };
  } catch (error) {
    const code = errorCodeOf(error);
    if (isSymlinkOrNotDirError(code)) {
      return { cliFd: null, unsafeLayout: true, errorCode: code };
    }
    if (code === "ENOENT") {
      return { cliFd: null, unsafeLayout: false, errorCode: null };
    }
    return { cliFd: null, unsafeLayout: false, errorCode: code };
  } finally {
    await geminiFd?.close();
    await homeFd?.close();
  }
}

/** Beyaz listedeki özet dosyalarının boyutunu ve 6 geçici dizindeki artık girdileri sabitlenmiş fd ile ölçer. */
export async function inspectGeminiHomeState(
  canonicalConfigHome: string,
): Promise<GeminiHomeInspection> {
  const { cliFd, unsafeLayout } = await openSafeCliDirectoryHandle(canonicalConfigHome);
  if (!cliFd) {
    return {
      totalBytes: 0,
      fileBytes: 0,
      ephemeralEntries: 0,
      hasEphemeralEntries: false,
      unsafeLayout,
    };
  }

  let fileBytes = 0;
  let ephemeralBytes = 0;
  let ephemeralEntries = 0;
  let detectedUnsafe = false;

  try {
    for (const fileName of GEMINI_PRUNABLE_STATE_FILES) {
      let stats;
      try {
        stats = await lstat(`/proc/self/fd/${cliFd.fd}/${fileName}`);
      } catch {
        continue;
      }
      if (stats.isFile()) {
        fileBytes += stats.size;
      } else if (fileName === "cli.log" && stats.isSymbolicLink()) {
        ephemeralEntries += 1;
      }
    }

    for (const [dirName] of GEMINI_EPHEMERAL_STATE_DIRS) {
      let subFd: FileHandle;
      try {
        subFd = await openDirectoryNoFollow(`/proc/self/fd/${cliFd.fd}/${dirName}`);
      } catch (error) {
        if (isSymlinkOrNotDirError(errorCodeOf(error))) detectedUnsafe = true;
        continue;
      }
      try {
        let names: string[];
        try {
          names = await readdir(`/proc/self/fd/${subFd.fd}`);
        } catch {
          continue;
        }
        ephemeralEntries += names.length;
        for (const entry of names) {
          try {
            const childStat = await lstat(`/proc/self/fd/${subFd.fd}/${entry}`);
            if (childStat.isFile()) ephemeralBytes += childStat.size;
          } catch {
            // Okuma sırasında kaybolan girdi yoksayılır.
          }
        }
      } finally {
        await subFd.close();
      }
    }
  } finally {
    await cliFd.close();
  }

  return {
    totalBytes: fileBytes + ephemeralBytes,
    fileBytes,
    ephemeralEntries,
    hasEphemeralEntries: ephemeralEntries > 0,
    unsafeLayout: detectedUnsafe,
  };
}

interface PruneCollector {
  deletedBytes: number;
  deletedFiles: number;
  deletedEntries: number;
  failedCount: number;
  errorCodes: Set<string>;
}

async function removeEntryNoFollow(
  parentFd: number,
  entryName: string,
  collector: PruneCollector,
  depth = 0,
): Promise<void> {
  if (depth > MAX_REMOVE_DEPTH) {
    collector.failedCount += 1;
    collector.errorCodes.add("ELOOP");
    return;
  }
  const entryPath = `/proc/self/fd/${parentFd}/${entryName}`;
  let stats;
  try {
    stats = await lstat(entryPath);
  } catch (error) {
    const code = errorCodeOf(error);
    if (code === "ENOENT") return;
    collector.failedCount += 1;
    collector.errorCodes.add(code);
    return;
  }

  if (stats.isDirectory() && !stats.isSymbolicLink()) {
    let childDirFd: FileHandle;
    try {
      childDirFd = await openDirectoryNoFollow(entryPath);
    } catch (error) {
      const code = errorCodeOf(error);
      if (code === "ENOENT") return;
      collector.failedCount += 1;
      collector.errorCodes.add(code);
      return;
    }
    try {
      let children: string[];
      try {
        children = await readdir(`/proc/self/fd/${childDirFd.fd}`);
      } catch (error) {
        const code = errorCodeOf(error);
        if (code !== "ENOENT") {
          collector.failedCount += 1;
          collector.errorCodes.add(code);
        }
        return;
      }
      for (const child of children) {
        await removeEntryNoFollow(childDirFd.fd, child, collector, depth + 1);
      }
    } finally {
      await childDirFd.close();
    }
    try {
      await rmdir(entryPath);
      if (depth === 0) collector.deletedEntries += 1;
    } catch (error) {
      const code = errorCodeOf(error);
      if (code !== "ENOENT") {
        collector.failedCount += 1;
        collector.errorCodes.add(code);
      }
    }
    return;
  }

  try {
    await unlink(entryPath);
    if (depth === 0) collector.deletedEntries += 1;
    if (stats.isFile()) collector.deletedBytes += stats.size;
  } catch (error) {
    const code = errorCodeOf(error);
    if (code !== "ENOENT") {
      collector.failedCount += 1;
      collector.errorCodes.add(code);
    }
  }
}

/**
 * Yalnız beyaz listedeki 5 özet/log dosyasını ve 6 geçici alt dizinin içeriğini sabitlenmiş
 * fd (`O_NOFOLLOW`) ile siler. Kimlik dosyalarına ve sembolik bağ hedeflerine dokunmaz;
 * `ENOENT` dışındaki silme hatalarını `partial_failure` ile raporlar.
 */
export async function pruneGeminiHomeStateFiles(
  canonicalConfigHome: string,
): Promise<PruneGeminiHomeResult> {
  const { cliFd, unsafeLayout, errorCode } = await openSafeCliDirectoryHandle(canonicalConfigHome);
  if (unsafeLayout) {
    return {
      pruned: false,
      reason: "unsafe_layout",
      deletedBytes: 0,
      deletedFiles: 0,
      deletedEntries: 0,
      failedCount: 0,
      errorCodes: errorCode ? [errorCode] : [],
    };
  }
  if (errorCode) {
    return {
      pruned: false,
      reason: "partial_failure",
      deletedBytes: 0,
      deletedFiles: 0,
      deletedEntries: 0,
      failedCount: 1,
      errorCodes: [errorCode],
    };
  }
  if (!cliFd) {
    return {
      pruned: true,
      reason: "pruned",
      deletedBytes: 0,
      deletedFiles: 0,
      deletedEntries: 0,
      failedCount: 0,
      errorCodes: [],
    };
  }

  const collector: PruneCollector = {
    deletedBytes: 0,
    deletedFiles: 0,
    deletedEntries: 0,
    failedCount: 0,
    errorCodes: new Set<string>(),
  };

  try {
    for (const fileName of GEMINI_PRUNABLE_STATE_FILES) {
      const filePath = `/proc/self/fd/${cliFd.fd}/${fileName}`;
      if (fileName === "cli.log") {
        let stats;
        try {
          stats = await lstat(filePath);
        } catch (error) {
          const code = errorCodeOf(error);
          if (code !== "ENOENT") {
            collector.failedCount += 1;
            collector.errorCodes.add(code);
          }
          continue;
        }
        if (!stats.isFile() && !stats.isSymbolicLink()) {
          collector.failedCount += 1;
          collector.errorCodes.add("EISDIR");
          continue;
        }
        try {
          await unlink(filePath);
          collector.deletedFiles += 1;
          if (stats.isFile()) collector.deletedBytes += stats.size;
        } catch (error) {
          const code = errorCodeOf(error);
          if (code !== "ENOENT") {
            collector.failedCount += 1;
            collector.errorCodes.add(code);
          }
        }
        continue;
      }

      let fh: FileHandle;
      try {
        fh = await open(
          filePath,
          fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK,
        );
      } catch (error) {
        const code = errorCodeOf(error);
        if (code === "ENOENT" || code === "ELOOP") {
          continue;
        }
        collector.failedCount += 1;
        collector.errorCodes.add(code);
        continue;
      }
      let size = 0;
      let regularFile = false;
      try {
        const stats = await fh.stat();
        regularFile = stats.isFile();
        if (regularFile) {
          size = stats.size;
        } else {
          collector.failedCount += 1;
          collector.errorCodes.add("EINVAL");
        }
      } catch (error) {
        collector.failedCount += 1;
        collector.errorCodes.add(errorCodeOf(error));
      } finally {
        await fh.close();
      }
      if (!regularFile) continue;

      try {
        await unlink(filePath);
        collector.deletedFiles += 1;
        collector.deletedBytes += size;
      } catch (error) {
        const code = errorCodeOf(error);
        if (code !== "ENOENT") {
          collector.failedCount += 1;
          collector.errorCodes.add(code);
        }
      }
    }

    for (const [dirName] of GEMINI_EPHEMERAL_STATE_DIRS) {
      let subFd: FileHandle;
      try {
        subFd = await openDirectoryNoFollow(`/proc/self/fd/${cliFd.fd}/${dirName}`);
      } catch (error) {
        const code = errorCodeOf(error);
        if (code !== "ENOENT") {
          collector.failedCount += 1;
          collector.errorCodes.add(code);
        }
        continue;
      }
      try {
        let names: string[];
        try {
          names = await readdir(`/proc/self/fd/${subFd.fd}`);
        } catch (error) {
          const code = errorCodeOf(error);
          if (code !== "ENOENT") {
            collector.failedCount += 1;
            collector.errorCodes.add(code);
          }
          continue;
        }
        for (const entry of names) {
          await removeEntryNoFollow(subFd.fd, entry, collector);
        }
      } finally {
        await subFd.close();
      }
    }
  } finally {
    await cliFd.close();
  }

  return {
    pruned: collector.failedCount === 0,
    reason: collector.failedCount > 0 ? "partial_failure" : "pruned",
    deletedBytes: collector.deletedBytes,
    deletedFiles: collector.deletedFiles,
    deletedEntries: collector.deletedEntries,
    failedCount: collector.failedCount,
    errorCodes: [...collector.errorCodes].sort(),
  };
}

async function terminateFlockChild(child: ChildProcess): Promise<void> {
  try {
    child.stdin?.destroy();
  } catch {
    // ignore
  }
  try {
    child.stdout?.destroy();
  } catch {
    // ignore
  }
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const fallback = setTimeout(resolve, 2000);
    fallback.unref();
    child.once("exit", () => {
      clearTimeout(fallback);
      resolve();
    });
    try {
      child.kill("SIGKILL");
    } catch {
      clearTimeout(fallback);
      resolve();
    }
  });
}

function buildFlockRelease(child: ChildProcess): GeminiCrossProcessLockHandle {
  let releasePromise: Promise<void> | undefined;
  return {
    release: () => {
      if (releasePromise) return releasePromise;
      releasePromise = new Promise<void>((resolve) => {
        if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
          try {
            child.stdout?.destroy();
          } catch {
            // ignore
          }
          resolve();
          return;
        }
        const killTimer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            try {
              child.kill("SIGKILL");
            } catch {
              // Süreç zaten çıkmış olabilir.
            }
          }
        }, 2000);
        killTimer.unref();
        child.once("exit", () => {
          clearTimeout(killTimer);
          resolve();
        });
        try {
          child.stdin?.end();
        } catch {
          try {
            child.kill("SIGKILL");
          } catch {
            clearTimeout(killTimer);
            resolve();
          }
        }
      });
      return releasePromise;
    },
  };
}

/**
 * `/usr/bin/flock --no-fork` + `/usr/bin/cat` alt süreci üzerinden gerçek kernel `LOCK_SH` / `LOCK_EX`
 * tutarlılığı sağlar; böylece worker ve harici probe (`agent-codex-status.ts`) çarpışmaz.
 */
export class FlockGeminiCrossProcessLock implements GeminiCrossProcessLock {
  readonly #flockPath: string;
  readonly #catPath: string;
  readonly #now: () => number;

  constructor(options?: { flockPath?: string; catPath?: string; now?: () => number }) {
    this.#flockPath = options?.flockPath ?? "/usr/bin/flock";
    this.#catPath = options?.catPath ?? "/usr/bin/cat";
    this.#now = options?.now ?? (() => Date.now());
  }

  async #openLockFile(
    canonicalConfigHome: string,
    createMissingDirs: boolean,
  ): Promise<{
    lockFd: FileHandle | null;
    status: "ok" | "missing" | "unsafe_layout" | "error";
    errorCode?: string;
  }> {
    let opened = await openSafeCliDirectoryHandle(canonicalConfigHome);
    if (!opened.cliFd && !opened.unsafeLayout && !opened.errorCode && createMissingDirs) {
      await prepareGeminiEphemeralMountPoints(canonicalConfigHome);
      opened = await openSafeCliDirectoryHandle(canonicalConfigHome);
    }
    if (opened.unsafeLayout) return { lockFd: null, status: "unsafe_layout" };
    if (opened.errorCode) return { lockFd: null, status: "error", errorCode: opened.errorCode };
    if (!opened.cliFd) return { lockFd: null, status: "missing" };

    try {
      const lockPath = `/proc/self/fd/${opened.cliFd.fd}/${GEMINI_HOME_LOCK_FILENAME}`;
      const lockFd = await open(lockPath, LOCK_OPEN_FLAGS, 0o600);
      try {
        const stats = await lockFd.stat();
        if (!stats.isFile()) {
          await lockFd.close();
          return { lockFd: null, status: "unsafe_layout" };
        }
      } catch (error) {
        await lockFd.close();
        return { lockFd: null, status: "error", errorCode: errorCodeOf(error) };
      }
      return { lockFd, status: "ok" };
    } catch (error) {
      const code = errorCodeOf(error);
      if (isSymlinkOrNotDirError(code)) return { lockFd: null, status: "unsafe_layout" };
      return { lockFd: null, status: "error", errorCode: code };
    } finally {
      await opened.cliFd.close();
    }
  }

  async acquireShared(
    configHome: string,
    options?: GeminiHomeSharedAccessOptions,
  ): Promise<GeminiCrossProcessLockHandle> {
    if (options?.signal?.aborted) {
      throw options.onCancel ? options.onCancel() : new Error("Gemini ev kilidi iptal edildi.");
    }
    if (options?.deadlineAtMs !== undefined && this.#now() >= options.deadlineAtMs) {
      throw options.onTimeout
        ? options.onTimeout()
        : new Error("Gemini ev kilidi zaman aşımına uğradı.");
    }

    const opened = await this.#openLockFile(configHome, true);
    if (opened.status === "unsafe_layout") {
      throw new Error("Gemini geçici durum dizini sembolik bağ veya dosya olamaz.");
    }
    if (!opened.lockFd) {
      throw new Error(`Gemini kilit dosyası açılamadı (${opened.errorCode ?? "EIO"}).`);
    }

    if (options?.signal?.aborted) {
      await opened.lockFd.close().catch(() => undefined);
      throw options.onCancel ? options.onCancel() : new Error("Gemini ev kilidi iptal edildi.");
    }
    if (options?.deadlineAtMs !== undefined && this.#now() >= options.deadlineAtMs) {
      await opened.lockFd.close().catch(() => undefined);
      throw options.onTimeout
        ? options.onTimeout()
        : new Error("Gemini ev kilidi zaman aşımına uğradı.");
    }

    const child = spawn(
      this.#flockPath,
      ["--no-fork", "--shared", "/proc/self/fd/3", this.#catPath],
      {
        cwd: "/",
        shell: false,
        env: {
          NODE_ENV: "production",
          PATH: "/usr/bin:/bin",
          LANG: "C.UTF-8",
          LC_ALL: "C.UTF-8",
        },
        stdio: ["pipe", "pipe", "ignore", opened.lockFd.fd],
      },
    );
    child.on("error", () => undefined);
    child.stdin?.on("error", () => undefined);
    child.stdout?.on("error", () => undefined);
    const closeParentLockFd = opened.lockFd.close().catch(() => undefined);

    return new Promise<GeminiCrossProcessLockHandle>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const cleanupListeners = () => {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        options?.signal?.removeEventListener("abort", onAbort);
        child.stdout?.removeListener("data", onData);
        child.removeListener("error", onError);
        child.removeListener("exit", onEarlyExit);
      };

      const rejectCleanly = (error: Error) => {
        void Promise.all([closeParentLockFd, terminateFlockChild(child)]).then(() => reject(error));
      };

      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanupListeners();
        rejectCleanly(
          options?.onCancel ? options.onCancel() : new Error("Gemini ev kilidi iptal edildi."),
        );
      };

      const onTimeout = () => {
        if (settled) return;
        settled = true;
        cleanupListeners();
        rejectCleanly(
          options?.onTimeout
            ? options.onTimeout()
            : new Error("Gemini ev kilidi zaman aşımına uğradı."),
        );
      };

      const onData = (chunk: Buffer) => {
        if (settled || chunk.length === 0) return;
        settled = true;
        cleanupListeners();
        void closeParentLockFd.then(() => resolve(buildFlockRelease(child)));
      };

      const onError = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanupListeners();
        rejectCleanly(err);
      };

      const onEarlyExit = () => {
        if (settled) return;
        settled = true;
        cleanupListeners();
        rejectCleanly(new Error("Gemini paylaşımlı dosya kilidi alınamadı."));
      };

      child.stdout?.on("data", onData);
      child.once("error", onError);
      child.once("exit", onEarlyExit);

      if (options?.signal) {
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
      if (options?.deadlineAtMs !== undefined) {
        const remaining = options.deadlineAtMs - this.#now();
        if (remaining <= 0) {
          onTimeout();
          return;
        }
        timer = setTimeout(onTimeout, remaining);
        timer.unref();
      }

      try {
        child.stdin?.write("1\n");
      } catch {
        // exit or error listener will settle
      }
    });
  }

  async acquireExclusive(
    configHome: string,
    options?: { nonBlocking?: boolean; timeoutMs?: number },
  ): Promise<GeminiExclusiveLockAcquisition> {
    const opened = await this.#openLockFile(configHome, false);
    if (opened.status === "missing") return { status: "missing" };
    if (opened.status === "unsafe_layout") return { status: "unsafe_layout" };
    if (opened.status === "error" || !opened.lockFd) {
      return { status: "error", errorCode: opened.errorCode ?? "EIO" };
    }

    const nonBlocking = options?.nonBlocking ?? false;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_EXCLUSIVE_LOCK_TIMEOUT_MS;
    const args = nonBlocking
      ? ["--no-fork", "--exclusive", "--nonblock", "/proc/self/fd/3", this.#catPath]
      : [
          "--no-fork",
          "--exclusive",
          "--timeout",
          String(Math.max(1, Math.ceil(timeoutMs / 1000))),
          "/proc/self/fd/3",
          this.#catPath,
        ];

    const child = spawn(this.#flockPath, args, {
      cwd: "/",
      shell: false,
      env: {
        NODE_ENV: "production",
        PATH: "/usr/bin:/bin",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
      },
      stdio: ["pipe", "pipe", "ignore", opened.lockFd.fd],
    });
    child.on("error", () => undefined);
    child.stdin?.on("error", () => undefined);
    child.stdout?.on("error", () => undefined);
    const closeParentLockFd = opened.lockFd.close().catch(() => undefined);

    return new Promise<GeminiExclusiveLockAcquisition>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const cleanupListeners = () => {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        child.stdout?.removeListener("data", onData);
        child.removeListener("error", onError);
        child.removeListener("exit", onEarlyExit);
      };

      const finishWith = (result: GeminiExclusiveLockAcquisition) => {
        void Promise.all([closeParentLockFd, terminateFlockChild(child)]).then(() =>
          resolve(result),
        );
      };

      const onData = (chunk: Buffer) => {
        if (settled || chunk.length === 0) return;
        settled = true;
        cleanupListeners();
        void closeParentLockFd.then(() =>
          resolve({ status: "acquired", handle: buildFlockRelease(child) }),
        );
      };

      const onError = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanupListeners();
        finishWith({ status: "error", errorCode: errorCodeOf(err) });
      };

      const onEarlyExit = (code: number | null) => {
        if (settled) return;
        settled = true;
        cleanupListeners();
        if (code === 1 || code === null) {
          finishWith({ status: "busy" });
        } else {
          finishWith({ status: "error", errorCode: `EXIT_${code}` });
        }
      };

      child.stdout?.on("data", onData);
      child.once("error", onError);
      child.once("exit", onEarlyExit);

      if (!nonBlocking) {
        timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanupListeners();
          finishWith({ status: "busy" });
        }, timeoutMs + 1000);
        timer.unref();
      }

      try {
        child.stdin?.write("1\n");
      } catch {
        // exit or error listener will settle
      }
    });
  }
}

interface SharedWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
  cleanup: () => void;
  settled: boolean;
}

interface ConfigHomeState {
  activeCalls: number;
  pruning: boolean;
  pruneWanted: boolean;
  hardBarrier: boolean;
  lastCheckedAtMs: number;
  sharedWaiters: SharedWaiter[];
  drainWaiters: Array<() => void>;
  activePrunePromise: Promise<PruneGeminiHomeResult> | null;
}

function defaultOnPruneFailure(result: PruneGeminiHomeResult): void {
  const codes = result.errorCodes.length > 0 ? result.errorCodes.join(",") : "-";
  process.stderr.write(
    `GEMINI_HOME_PRUNE_FAILED reason=${result.reason} failedCount=${result.failedCount} codes=${codes}\n`,
  );
}

/**
 * Aynı `configHome` dizinini kullanan süreç içi (`GeminiRuntimeProvider`, `GeminiCliProvider`) ve
 * süreçler arası (worker, harici probe) çağrılar için paylaşımlı/özel temizlik koordinatörü.
 */
export class GeminiHomeCoordinator {
  readonly #states = new Map<string, ConfigHomeState>();
  readonly #now: () => number;
  readonly #crossProcessLock: GeminiCrossProcessLock;
  readonly #onPruneFailure: (result: PruneGeminiHomeResult) => void;

  constructor(options?: {
    now?: () => number;
    crossProcessLock?: GeminiCrossProcessLock;
    onPruneFailure?: (result: PruneGeminiHomeResult) => void;
  }) {
    this.#now = options?.now ?? (() => Date.now());
    this.#crossProcessLock =
      options?.crossProcessLock ??
      new FlockGeminiCrossProcessLock({
        now: this.#now,
      });
    this.#onPruneFailure = options?.onPruneFailure ?? defaultOnPruneFailure;
  }

  #getState(configHome: string): ConfigHomeState {
    let state = this.#states.get(configHome);
    if (!state) {
      state = {
        activeCalls: 0,
        pruning: false,
        pruneWanted: false,
        hardBarrier: false,
        lastCheckedAtMs: Number.NEGATIVE_INFINITY,
        sharedWaiters: [],
        drainWaiters: [],
        activePrunePromise: null,
      };
      this.#states.set(configHome, state);
    }
    return state;
  }

  #flushSharedWaiters(state: ConfigHomeState): void {
    if (state.pruning || state.hardBarrier) return;
    const waiters = state.sharedWaiters.splice(0);
    for (const waiter of waiters) {
      if (waiter.settled) continue;
      waiter.settled = true;
      waiter.cleanup();
      waiter.resolve();
    }
  }

  #assertAccessBudget(options?: GeminiHomeSharedAccessOptions): void {
    if (options?.signal?.aborted) {
      throw options.onCancel ? options.onCancel() : new Error("Gemini ev erişimi iptal edildi.");
    }
    if (options?.deadlineAtMs !== undefined && this.#now() >= options.deadlineAtMs) {
      throw options.onTimeout
        ? options.onTimeout()
        : new Error("Gemini ev erişimi zaman aşımına uğradı.");
    }
  }

  #waitForSharedTurn(
    state: ConfigHomeState,
    options?: GeminiHomeSharedAccessOptions,
  ): Promise<void> {
    this.#assertAccessBudget(options);
    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const waiter: SharedWaiter = {
        resolve,
        reject,
        settled: false,
        cleanup: () => {
          if (timer) {
            clearTimeout(timer);
            timer = undefined;
          }
          options?.signal?.removeEventListener("abort", onAbort);
        },
      };
      const removeWaiter = () => {
        const index = state.sharedWaiters.indexOf(waiter);
        if (index >= 0) state.sharedWaiters.splice(index, 1);
      };
      const onAbort = () => {
        if (waiter.settled) return;
        waiter.settled = true;
        removeWaiter();
        waiter.cleanup();
        reject(
          options?.onCancel ? options.onCancel() : new Error("Gemini ev erişimi iptal edildi."),
        );
      };
      const onTimeout = () => {
        if (waiter.settled) return;
        waiter.settled = true;
        removeWaiter();
        waiter.cleanup();
        reject(
          options?.onTimeout
            ? options.onTimeout()
            : new Error("Gemini ev erişimi zaman aşımına uğradı."),
        );
      };

      if (options?.signal) {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
      if (options?.deadlineAtMs !== undefined) {
        const remaining = options.deadlineAtMs - this.#now();
        if (remaining <= 0) {
          waiter.settled = true;
          waiter.cleanup();
          reject(
            options.onTimeout
              ? options.onTimeout()
              : new Error("Gemini ev erişimi zaman aşımına uğradı."),
          );
          return;
        }
        timer = setTimeout(onTimeout, remaining);
        timer.unref();
      }
      state.sharedWaiters.push(waiter);
    });
  }

  async #runExclusiveUnderOsLock(
    configHome: string,
    state: ConfigHomeState,
    lockOptions: { nonBlocking: boolean; timeoutMs?: number },
  ): Promise<PruneGeminiHomeResult> {
    const acquired = await this.#crossProcessLock.acquireExclusive(configHome, lockOptions);
    state.lastCheckedAtMs = this.#now();

    if (acquired.status === "missing") {
      return {
        pruned: true,
        reason: "pruned",
        deletedBytes: 0,
        deletedFiles: 0,
        deletedEntries: 0,
        failedCount: 0,
        errorCodes: [],
      };
    }
    if (acquired.status === "busy") {
      return {
        pruned: false,
        reason: "lock_busy",
        deletedBytes: 0,
        deletedFiles: 0,
        deletedEntries: 0,
        failedCount: 0,
        errorCodes: [],
      };
    }
    if (acquired.status === "unsafe_layout") {
      const failResult: PruneGeminiHomeResult = {
        pruned: false,
        reason: "unsafe_layout",
        deletedBytes: 0,
        deletedFiles: 0,
        deletedEntries: 0,
        failedCount: 0,
        errorCodes: [],
      };
      this.#onPruneFailure(failResult);
      return failResult;
    }
    if (acquired.status === "error") {
      const failResult: PruneGeminiHomeResult = {
        pruned: false,
        reason: "partial_failure",
        deletedBytes: 0,
        deletedFiles: 0,
        deletedEntries: 0,
        failedCount: 1,
        errorCodes: [acquired.errorCode],
      };
      this.#onPruneFailure(failResult);
      return failResult;
    }

    try {
      const result = await pruneGeminiHomeStateFiles(configHome);
      state.lastCheckedAtMs = this.#now();
      if (result.reason === "partial_failure" || result.reason === "unsafe_layout") {
        this.#onPruneFailure(result);
      }
      return result;
    } finally {
      await acquired.handle.release().catch(() => undefined);
    }
  }

  #launchExclusivePrune(
    configHome: string,
    state: ConfigHomeState,
    lockOptions: { nonBlocking: boolean; timeoutMs?: number },
  ): Promise<PruneGeminiHomeResult> {
    state.pruning = true;
    state.pruneWanted = false;
    const promise = (async (): Promise<PruneGeminiHomeResult> => {
      try {
        return await this.#runExclusiveUnderOsLock(configHome, state, lockOptions);
      } finally {
        state.pruning = false;
        state.hardBarrier = false;
        state.activePrunePromise = null;
        this.#flushSharedWaiters(state);
      }
    })();
    promise.catch(() => undefined);
    state.activePrunePromise = promise;
    return promise;
  }

  #releaseSharedAccess(configHome: string, state: ConfigHomeState): void {
    state.activeCalls -= 1;
    if (state.activeCalls > 0) return;
    if (state.drainWaiters.length > 0) {
      const waiters = state.drainWaiters.splice(0);
      for (const wake of waiters) wake();
      return;
    }
    if (state.pruneWanted && !state.pruning && !state.activePrunePromise) {
      this.#launchExclusivePrune(configHome, state, { nonBlocking: true });
    }
  }

  async withSharedAccess<T>(
    configHome: string,
    fn: () => Promise<T>,
    options?: GeminiHomeSharedAccessOptions,
  ): Promise<T> {
    const state = this.#getState(configHome);
    this.#assertAccessBudget(options);
    while (state.pruning || state.hardBarrier) {
      await this.#waitForSharedTurn(state, options);
      this.#assertAccessBudget(options);
    }
    state.activeCalls += 1;
    let osLock: GeminiCrossProcessLockHandle | null = null;
    try {
      osLock = await this.#crossProcessLock.acquireShared(configHome, options);
      return await fn();
    } finally {
      if (osLock) {
        await osLock.release().catch(() => undefined);
      }
      this.#releaseSharedAccess(configHome, state);
    }
  }

  async pruneIfNeeded(
    configHome: string,
    options?: GeminiHomePruneOptions,
  ): Promise<PruneGeminiHomeResult> {
    const state = this.#getState(configHome);
    if (state.activePrunePromise) return state.activePrunePromise;

    const force = options?.force ?? false;
    const softThresholdBytes = options?.softThresholdBytes ?? DEFAULT_GEMINI_SOFT_THRESHOLD_BYTES;
    const hardThresholdBytes = Math.max(
      softThresholdBytes,
      options?.hardThresholdBytes ?? DEFAULT_GEMINI_HARD_THRESHOLD_BYTES,
    );
    const minCheckIntervalMs = options?.minCheckIntervalMs ?? DEFAULT_GEMINI_MIN_CHECK_INTERVAL_MS;
    const exclusiveTimeoutMs = options?.exclusiveTimeoutMs ?? DEFAULT_EXCLUSIVE_LOCK_TIMEOUT_MS;

    if (!force && this.#now() - state.lastCheckedAtMs < minCheckIntervalMs) {
      return {
        pruned: false,
        reason: "interval",
        deletedBytes: 0,
        deletedFiles: 0,
        deletedEntries: 0,
        failedCount: 0,
        errorCodes: [],
      };
    }

    if (!force) {
      const inspection = await inspectGeminiHomeState(configHome);
      state.lastCheckedAtMs = this.#now();
      if (state.activePrunePromise) return state.activePrunePromise;
      if (inspection.unsafeLayout) {
        const failResult: PruneGeminiHomeResult = {
          pruned: false,
          reason: "unsafe_layout",
          deletedBytes: 0,
          deletedFiles: 0,
          deletedEntries: 0,
          failedCount: 0,
          errorCodes: [],
        };
        this.#onPruneFailure(failResult);
        return failResult;
      }
      const needsPrune =
        inspection.hasEphemeralEntries || inspection.totalBytes >= softThresholdBytes;
      if (!needsPrune) {
        return {
          pruned: false,
          reason: "below_threshold",
          deletedBytes: 0,
          deletedFiles: 0,
          deletedEntries: 0,
          failedCount: 0,
          errorCodes: [],
        };
      }
      if (inspection.totalBytes < hardThresholdBytes) {
        if (state.activeCalls > 0) {
          state.pruneWanted = true;
          return {
            pruned: false,
            reason: "deferred_until_idle",
            deletedBytes: 0,
            deletedFiles: 0,
            deletedEntries: 0,
            failedCount: 0,
            errorCodes: [],
          };
        }
        return this.#launchExclusivePrune(configHome, state, { nonBlocking: true });
      }
    }

    if (state.activePrunePromise) return state.activePrunePromise;
    if (state.activeCalls === 0) {
      return this.#launchExclusivePrune(configHome, state, {
        nonBlocking: false,
        timeoutMs: exclusiveTimeoutMs,
      });
    }

    state.hardBarrier = true;
    state.pruneWanted = true;
    const promise = (async (): Promise<PruneGeminiHomeResult> => {
      try {
        while (state.activeCalls > 0) {
          await new Promise<void>((resolve) => {
            state.drainWaiters.push(resolve);
          });
        }
        state.pruning = true;
        state.pruneWanted = false;
        return await this.#runExclusiveUnderOsLock(configHome, state, {
          nonBlocking: false,
          timeoutMs: exclusiveTimeoutMs,
        });
      } finally {
        state.pruning = false;
        state.hardBarrier = false;
        state.pruneWanted = false;
        state.activePrunePromise = null;
        this.#flushSharedWaiters(state);
      }
    })();
    promise.catch(() => undefined);
    state.activePrunePromise = promise;
    return promise;
  }

  schedulePruneIfNeeded(configHome: string, options?: GeminiHomePruneOptions): void {
    void this.pruneIfNeeded(configHome, options).catch(() => undefined);
  }
}

export const defaultGeminiHomeCoordinator = new GeminiHomeCoordinator();
