import { lstat, mkdir, readdir, rm, unlink } from "node:fs/promises";
import path from "node:path";

/*
  Gemini CLI (`agy 1.5.18`) her çağrıda `HOME/.gemini/antigravity-cli` altında konuşma SQLite
  dosyaları, brain klasörleri, CLI logları ve özet veritabanı biriktirir. Altı geçici alt dizin
  Bubblewrap `--size ... --tmpfs` ile bellek içinde tutulur; konak diskinde oluşabilecek özet
  SQLite dosyaları ve artık dizin girdileri ise kimlik dosyalarına (`antigravity-oauth-token`,
  `installation_id`, `jetski_state.pbtxt`, `builtin/`, `cache/`, `updater/`) dokunmadan eşgüdümlü
  olarak temizlenir.
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

export const DEFAULT_GEMINI_SOFT_THRESHOLD_BYTES = 16 * 1024 * 1024;
export const DEFAULT_GEMINI_HARD_THRESHOLD_BYTES = 64 * 1024 * 1024;
export const DEFAULT_GEMINI_MIN_CHECK_INTERVAL_MS = 5 * 60_000;

export interface GeminiHomeInspection {
  totalBytes: number;
  fileBytes: number;
  ephemeralEntries: number;
  hasEphemeralEntries: boolean;
  unsafeLayout: boolean;
}

export interface PruneGeminiHomeResult {
  pruned: boolean;
  reason: "pruned" | "interval" | "below_threshold" | "deferred_until_idle" | "unsafe_layout";
  deletedBytes: number;
  deletedFiles: number;
  deletedEntries: number;
}

export interface GeminiHomePruneOptions {
  force?: boolean;
  softThresholdBytes?: number;
  hardThresholdBytes?: number;
  minCheckIntervalMs?: number;
}

export interface GeminiHomeSharedAccessOptions {
  signal?: AbortSignal | undefined;
  deadlineAtMs?: number | undefined;
  onCancel?: (() => Error) | undefined;
  onTimeout?: (() => Error) | undefined;
}

async function ensureRealDirectory(targetPath: string, label: string): Promise<void> {
  try {
    const stats = await lstat(targetPath);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`${label} sembolik bağ veya dosya olamaz.`);
    }
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await mkdir(targetPath, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const stats = await lstat(targetPath);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`${label} sembolik bağ veya dosya olamaz.`);
    }
  }
}

/**
 * Konfigürasyon kökünden başlayarak `agy` özel ajan bağlama noktasını ve 6 geçici tmpfs
 * bağlama dizinini sembolik bağlara izin vermeden adım adım doğrular/oluşturur.
 */
export async function prepareGeminiEphemeralMountPoints(
  canonicalConfigHome: string,
): Promise<void> {
  if (!path.isAbsolute(canonicalConfigHome)) {
    throw new Error("Gemini config home mutlak olmalıdır.");
  }
  const geminiDir = path.join(canonicalConfigHome, ".gemini");
  const configDir = path.join(geminiDir, "config");
  const agentsDir = path.join(configDir, "agents");
  const cliDir = path.join(geminiDir, "antigravity-cli");

  await ensureRealDirectory(canonicalConfigHome, "Gemini config home");
  await ensureRealDirectory(geminiDir, "Gemini durum dizini");
  await ensureRealDirectory(configDir, "Gemini yapılandırma dizini");
  await ensureRealDirectory(agentsDir, "Gemini ajan dizini");
  await ensureRealDirectory(cliDir, "Gemini CLI durum dizini");
  for (const [name] of GEMINI_EPHEMERAL_STATE_DIRS) {
    await ensureRealDirectory(path.join(cliDir, name), `Gemini geçici dizini (${name})`);
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

async function safeLstat(targetPath: string) {
  try {
    return await lstat(targetPath);
  } catch {
    return null;
  }
}

async function resolveSafeCliDirectory(
  canonicalConfigHome: string,
): Promise<{ cliDir: string | null; unsafeLayout: boolean }> {
  const homeStat = await safeLstat(canonicalConfigHome);
  if (!homeStat) return { cliDir: null, unsafeLayout: false };
  if (homeStat.isSymbolicLink() || !homeStat.isDirectory()) {
    return { cliDir: null, unsafeLayout: true };
  }
  const geminiDir = path.join(canonicalConfigHome, ".gemini");
  const geminiStat = await safeLstat(geminiDir);
  if (!geminiStat) return { cliDir: null, unsafeLayout: false };
  if (geminiStat.isSymbolicLink() || !geminiStat.isDirectory()) {
    return { cliDir: null, unsafeLayout: true };
  }
  const cliDir = path.join(geminiDir, "antigravity-cli");
  const cliStat = await safeLstat(cliDir);
  if (!cliStat) return { cliDir: null, unsafeLayout: false };
  if (cliStat.isSymbolicLink() || !cliStat.isDirectory()) {
    return { cliDir: null, unsafeLayout: true };
  }
  return { cliDir, unsafeLayout: false };
}

/** Beyaz listedeki özet dosyalarının boyutunu ve 6 geçici dizindeki artık girdileri salt okunur ölçer. */
export async function inspectGeminiHomeState(
  canonicalConfigHome: string,
): Promise<GeminiHomeInspection> {
  const { cliDir, unsafeLayout } = await resolveSafeCliDirectory(canonicalConfigHome);
  if (unsafeLayout) {
    return {
      totalBytes: 0,
      fileBytes: 0,
      ephemeralEntries: 0,
      hasEphemeralEntries: false,
      unsafeLayout: true,
    };
  }
  if (!cliDir) {
    return {
      totalBytes: 0,
      fileBytes: 0,
      ephemeralEntries: 0,
      hasEphemeralEntries: false,
      unsafeLayout: false,
    };
  }

  let fileBytes = 0;
  let ephemeralBytes = 0;
  let ephemeralEntries = 0;

  for (const fileName of GEMINI_PRUNABLE_STATE_FILES) {
    const stats = await safeLstat(path.join(cliDir, fileName));
    if (!stats) continue;
    if (stats.isFile()) {
      fileBytes += stats.size;
    } else if (fileName === "cli.log" && stats.isSymbolicLink()) {
      ephemeralEntries += 1;
    }
  }

  for (const [dirName] of GEMINI_EPHEMERAL_STATE_DIRS) {
    const dirPath = path.join(cliDir, dirName);
    const dirStat = await safeLstat(dirPath);
    if (!dirStat || dirStat.isSymbolicLink() || !dirStat.isDirectory()) continue;
    let names: string[];
    try {
      names = await readdir(dirPath);
    } catch {
      continue;
    }
    ephemeralEntries += names.length;
    for (const entry of names) {
      const childStat = await safeLstat(path.join(dirPath, entry));
      if (childStat && childStat.isFile()) {
        ephemeralBytes += childStat.size;
      }
    }
  }

  return {
    totalBytes: fileBytes + ephemeralBytes,
    fileBytes,
    ephemeralEntries,
    hasEphemeralEntries: ephemeralEntries > 0,
    unsafeLayout: false,
  };
}

/**
 * Yalnız beyaz listedeki 5 özet/log dosyasını ve 6 geçici alt dizinin içeriğini siler.
 * Kimlik ve kurulum dosyalarına (`antigravity-oauth-token`, `installation_id`,
 * `jetski_state.pbtxt`, `builtin`, `cache`, `updater`) dokunmaz ve sembolik bağları izlemez.
 */
export async function pruneGeminiHomeStateFiles(
  canonicalConfigHome: string,
): Promise<PruneGeminiHomeResult> {
  const { cliDir, unsafeLayout } = await resolveSafeCliDirectory(canonicalConfigHome);
  if (unsafeLayout) {
    return {
      pruned: false,
      reason: "unsafe_layout",
      deletedBytes: 0,
      deletedFiles: 0,
      deletedEntries: 0,
    };
  }
  if (!cliDir) {
    return {
      pruned: true,
      reason: "pruned",
      deletedBytes: 0,
      deletedFiles: 0,
      deletedEntries: 0,
    };
  }

  let deletedBytes = 0;
  let deletedFiles = 0;
  let deletedEntries = 0;

  for (const fileName of GEMINI_PRUNABLE_STATE_FILES) {
    const filePath = path.join(cliDir, fileName);
    const stats = await safeLstat(filePath);
    if (!stats) continue;
    const allowed =
      fileName === "cli.log" ? stats.isFile() || stats.isSymbolicLink() : stats.isFile();
    if (!allowed) continue;
    try {
      await unlink(filePath);
      deletedFiles += 1;
      if (stats.isFile()) deletedBytes += stats.size;
    } catch {
      // Eşzamanlı temizlik veya ENOENT akışı durdurmaz.
    }
  }

  for (const [dirName] of GEMINI_EPHEMERAL_STATE_DIRS) {
    const dirPath = path.join(cliDir, dirName);
    const dirStat = await safeLstat(dirPath);
    if (!dirStat || dirStat.isSymbolicLink() || !dirStat.isDirectory()) continue;
    let names: string[];
    try {
      names = await readdir(dirPath);
    } catch {
      continue;
    }
    for (const entry of names) {
      const childPath = path.join(dirPath, entry);
      const childStat = await safeLstat(childPath);
      try {
        await rm(childPath, { recursive: true, force: true });
        deletedEntries += 1;
        if (childStat && childStat.isFile()) deletedBytes += childStat.size;
      } catch {
        // Girdi bazlı temizlik hataları sonraki girdileri ve worker'ı engellemez.
      }
    }
  }

  return {
    pruned: true,
    reason: "pruned",
    deletedBytes,
    deletedFiles,
    deletedEntries,
  };
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

/**
 * Aynı `configHome` dizinini kullanan `GeminiRuntimeProvider` ve `GeminiCliProvider` arasında
 * paylaşımlı çalışma ve güvenli temizlik kapısı sağlar.
 */
export class GeminiHomeCoordinator {
  readonly #states = new Map<string, ConfigHomeState>();
  readonly #now: () => number;

  constructor(options?: { now?: () => number }) {
    this.#now = options?.now ?? (() => Date.now());
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

  #launchExclusivePrune(
    configHome: string,
    state: ConfigHomeState,
  ): Promise<PruneGeminiHomeResult> {
    state.pruning = true;
    state.pruneWanted = false;
    const promise = (async (): Promise<PruneGeminiHomeResult> => {
      try {
        const result = await pruneGeminiHomeStateFiles(configHome);
        state.lastCheckedAtMs = this.#now();
        return result;
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
      this.#launchExclusivePrune(configHome, state);
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
    try {
      return await fn();
    } finally {
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

    if (!force && this.#now() - state.lastCheckedAtMs < minCheckIntervalMs) {
      return {
        pruned: false,
        reason: "interval",
        deletedBytes: 0,
        deletedFiles: 0,
        deletedEntries: 0,
      };
    }

    if (!force) {
      const inspection = await inspectGeminiHomeState(configHome);
      state.lastCheckedAtMs = this.#now();
      if (state.activePrunePromise) return state.activePrunePromise;
      if (inspection.unsafeLayout) {
        return {
          pruned: false,
          reason: "unsafe_layout",
          deletedBytes: 0,
          deletedFiles: 0,
          deletedEntries: 0,
        };
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
          };
        }
        return this.#launchExclusivePrune(configHome, state);
      }
    }

    if (state.activePrunePromise) return state.activePrunePromise;
    if (state.activeCalls === 0) {
      return this.#launchExclusivePrune(configHome, state);
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
        const result = await pruneGeminiHomeStateFiles(configHome);
        state.lastCheckedAtMs = this.#now();
        return result;
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
