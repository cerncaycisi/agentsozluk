import { lstatSync, readFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GEMINI_EPHEMERAL_STATE_DIRS,
  GEMINI_HOME_LOCK_FILENAME,
  GEMINI_PRUNABLE_STATE_FILES,
  GeminiHomeCoordinator,
  geminiEphemeralTmpfsArgs,
  inspectGeminiHomeState,
  prepareGeminiEphemeralMountPoints,
  pruneGeminiHomeStateFiles,
  type PruneGeminiHomeResult,
} from "@/runtime/gemini-home-retention";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

describe("gemini-home-retention", () => {
  it("creates ephemeral mount points and agents directory without following symlinks", async () => {
    const root = await makeTempDir("gemini-mount-");
    const home = path.join(root, "gemini-home");
    await prepareGeminiEphemeralMountPoints(home);

    const cliDir = path.join(home, ".gemini", "antigravity-cli");
    expect(lstatSync(path.join(home, ".gemini", "config", "agents")).isDirectory()).toBe(true);
    for (const [name] of GEMINI_EPHEMERAL_STATE_DIRS) {
      const target = path.join(cliDir, name);
      expect(lstatSync(target).isDirectory()).toBe(true);
      expect(lstatSync(target).isSymbolicLink()).toBe(false);
    }

    const args = geminiEphemeralTmpfsArgs(home);
    for (const [name, sizeBytes] of GEMINI_EPHEMERAL_STATE_DIRS) {
      const mountTarget = path.join(cliDir, name);
      const tmpfsIndex = args.indexOf(mountTarget);
      expect(tmpfsIndex).toBeGreaterThanOrEqual(3);
      expect(args[tmpfsIndex - 1]).toBe("--tmpfs");
      expect(args[tmpfsIndex - 2]).toBe(String(sizeBytes));
      expect(args[tmpfsIndex - 3]).toBe("--size");
    }

    const symlinkHomeRoot = await makeTempDir("gemini-sym-");
    const realTarget = path.join(symlinkHomeRoot, "outside");
    await mkdir(realTarget);
    const badHome = path.join(symlinkHomeRoot, "home");
    await mkdir(path.join(badHome, ".gemini", "antigravity-cli"), { recursive: true });
    await symlink(realTarget, path.join(badHome, ".gemini", "antigravity-cli", "conversations"));
    await expect(prepareGeminiEphemeralMountPoints(badHome)).rejects.toThrow("sembolik bağ");

    const fileHome = path.join(symlinkHomeRoot, "file-home");
    await mkdir(path.join(fileHome, ".gemini"), { recursive: true });
    await writeFile(path.join(fileHome, ".gemini", "antigravity-cli"), "not a dir");
    await expect(prepareGeminiEphemeralMountPoints(fileHome)).rejects.toThrow("sembolik bağ");
  });

  it("prunes only whitelisted summary files and ephemeral contents while preserving identity and symlink targets", async () => {
    const root = await makeTempDir("gemini-prune-");
    const home = path.join(root, "gemini-home");
    const outsideVictim = path.join(root, "outside-secret.txt");
    const outsideLogTarget = path.join(root, "outside-log.txt");
    await writeFile(outsideVictim, "DO_NOT_DELETE");
    await writeFile(outsideLogTarget, "LOG_TARGET_KEEP");

    await prepareGeminiEphemeralMountPoints(home);
    const cliDir = path.join(home, ".gemini", "antigravity-cli");

    await writeFile(path.join(cliDir, "antigravity-oauth-token"), "oauth-token");
    await writeFile(path.join(cliDir, "installation_id"), "install-123");
    await writeFile(path.join(cliDir, "jetski_state.pbtxt"), "state-pb");
    await writeFile(path.join(cliDir, GEMINI_HOME_LOCK_FILENAME), "");
    await mkdir(path.join(cliDir, "builtin"), { recursive: true });
    await writeFile(path.join(cliDir, "builtin", "keep.txt"), "keep-me");

    for (const fileName of GEMINI_PRUNABLE_STATE_FILES) {
      if (fileName === "conversation_summaries.db") {
        await symlink(outsideVictim, path.join(cliDir, fileName));
      } else if (fileName === "cli.log") {
        await symlink(outsideLogTarget, path.join(cliDir, fileName));
      } else {
        await writeFile(path.join(cliDir, fileName), "x".repeat(1024));
      }
    }

    await writeFile(path.join(cliDir, "conversations", "c1.db"), "conv-data");
    await mkdir(path.join(cliDir, "brain", "b1"), { recursive: true });
    await writeFile(path.join(cliDir, "brain", "b1", "artifact.md"), "brain-data");
    await writeFile(path.join(cliDir, "log", "cli-1.log"), "log-data");

    const before = await inspectGeminiHomeState(home);
    expect(before.hasEphemeralEntries).toBe(true);
    expect(before.unsafeLayout).toBe(false);

    const result = await pruneGeminiHomeStateFiles(home);
    expect(result).toMatchObject({
      pruned: true,
      reason: "pruned",
      failedCount: 0,
      errorCodes: [],
    });
    expect(result.deletedFiles).toBe(GEMINI_PRUNABLE_STATE_FILES.length - 1);
    expect(result.deletedEntries).toBe(3);

    expect(readFileSync(outsideVictim, "utf8")).toBe("DO_NOT_DELETE");
    expect(lstatSync(path.join(cliDir, "conversation_summaries.db")).isSymbolicLink()).toBe(true);
    expect(readFileSync(outsideLogTarget, "utf8")).toBe("LOG_TARGET_KEEP");
    expect(() => lstatSync(path.join(cliDir, "cli.log"))).toThrow();
    expect(readFileSync(path.join(cliDir, "antigravity-oauth-token"), "utf8")).toBe("oauth-token");
    expect(readFileSync(path.join(cliDir, "installation_id"), "utf8")).toBe("install-123");
    expect(readFileSync(path.join(cliDir, "jetski_state.pbtxt"), "utf8")).toBe("state-pb");
    expect(lstatSync(path.join(cliDir, GEMINI_HOME_LOCK_FILENAME)).isFile()).toBe(true);
    expect(readFileSync(path.join(cliDir, "builtin", "keep.txt"), "utf8")).toBe("keep-me");

    for (const [name] of GEMINI_EPHEMERAL_STATE_DIRS) {
      const target = path.join(cliDir, name);
      expect(lstatSync(target).isDirectory()).toBe(true);
      expect(await readdir(target)).toEqual([]);
    }
  });

  it("refuses symlinked ephemeral subdirs without touching target files (TOCTOU immunity)", async () => {
    const root = await makeTempDir("gemini-toctou-");
    const home = path.join(root, "gemini-home");
    const victimDir = path.join(root, "victim");
    await mkdir(victimDir);
    await writeFile(path.join(victimDir, "identity.key"), "DO_NOT_TOUCH");

    await prepareGeminiEphemeralMountPoints(home);
    const cliDir = path.join(home, ".gemini", "antigravity-cli");
    const convDir = path.join(cliDir, "conversations");

    // 1. Doğrudan sembolik bağ yapılan ephemeral dizin içeriği silinmez ve hata raporlanır.
    await rm(convDir, { recursive: true });
    await symlink(victimDir, convDir);

    const symlinkResult = await pruneGeminiHomeStateFiles(home);
    expect(readFileSync(path.join(victimDir, "identity.key"), "utf8")).toBe("DO_NOT_TOUCH");
    expect((await inspectGeminiHomeState(home)).unsafeLayout).toBe(true);
    expect(symlinkResult.pruned).toBe(false);
    expect(symlinkResult.reason).toBe("partial_failure");
    expect(symlinkResult.failedCount).toBeGreaterThanOrEqual(1);
    expect(symlinkResult.errorCodes.some((code) => code === "ELOOP" || code === "ENOTDIR")).toBe(
      true,
    );

    // 2. İç içe dizin sembolik bağa çevrilmişse yine hedef klasördeki dosya korunur, bağın kendisi silinir.
    await rm(convDir);
    await mkdir(convDir, { mode: 0o700 });
    await mkdir(path.join(cliDir, "brain", "sub"), { recursive: true });
    await symlink(victimDir, path.join(cliDir, "brain", "nested-link"));
    await rename(path.join(cliDir, "brain", "sub"), path.join(root, "moved-sub"));
    await symlink(victimDir, path.join(cliDir, "brain", "sub"));

    const nestedResult = await pruneGeminiHomeStateFiles(home);
    expect(nestedResult.pruned).toBe(true);
    expect(readFileSync(path.join(victimDir, "identity.key"), "utf8")).toBe("DO_NOT_TOUCH");
  });

  it("reports EACCES prune failures explicitly instead of masking them as pruned:true", async () => {
    const root = await makeTempDir("gemini-eacces-");
    const home = path.join(root, "gemini-home");
    await prepareGeminiEphemeralMountPoints(home);
    const cliDir = path.join(home, ".gemini", "antigravity-cli");
    const brainDir = path.join(cliDir, "brain");
    const trappedFile = path.join(brainDir, "locked.txt");
    await writeFile(trappedFile, "locked");

    const failures: PruneGeminiHomeResult[] = [];
    const coordinator = new GeminiHomeCoordinator({
      onPruneFailure: (result) => failures.push(result),
    });

    await chmod(brainDir, 0o500);
    try {
      const result = await coordinator.pruneIfNeeded(home, { force: true });
      if (process.getuid?.() !== 0) {
        expect(result.pruned).toBe(false);
        expect(result.reason).toBe("partial_failure");
        expect(result.failedCount).toBeGreaterThanOrEqual(1);
        expect(result.errorCodes).toContain("EACCES");
        expect(failures).toHaveLength(1);
        expect(failures[0]!.errorCodes).toContain("EACCES");
      }
    } finally {
      await chmod(brainDir, 0o700);
    }
  });

  it("coordinates parallel shared calls, defers soft prune until idle, and drains on hard threshold", async () => {
    const root = await makeTempDir("gemini-coord-");
    const home = path.join(root, "gemini-home");
    await prepareGeminiEphemeralMountPoints(home);
    const cliDir = path.join(home, ".gemini", "antigravity-cli");
    await writeFile(path.join(cliDir, "antigravity-oauth-token"), "token");

    let now = 1_000_000;
    const coordinator = new GeminiHomeCoordinator({ now: () => now });

    let releaseA!: () => void;
    let releaseB!: () => void;
    let aEntered!: () => void;
    let bEntered!: () => void;
    const aReady = new Promise<void>((r) => {
      aEntered = r;
    });
    const bReady = new Promise<void>((r) => {
      bEntered = r;
    });
    let maxParallel = 0;
    let currentParallel = 0;

    const callA = coordinator.withSharedAccess(home, async () => {
      currentParallel += 1;
      maxParallel = Math.max(maxParallel, currentParallel);
      aEntered();
      await new Promise<void>((r) => {
        releaseA = r;
      });
      currentParallel -= 1;
      return "A";
    });
    const callB = coordinator.withSharedAccess(home, async () => {
      currentParallel += 1;
      maxParallel = Math.max(maxParallel, currentParallel);
      bEntered();
      await new Promise<void>((r) => {
        releaseB = r;
      });
      currentParallel -= 1;
      return "B";
    });

    await Promise.all([aReady, bReady]);
    expect(maxParallel).toBe(2);

    await writeFile(path.join(cliDir, "conversation_summaries.db"), "x".repeat(200));
    const soft = await coordinator.pruneIfNeeded(home, {
      softThresholdBytes: 100,
      hardThresholdBytes: 10_000,
      minCheckIntervalMs: 60_000,
    });
    expect(soft).toMatchObject({ pruned: false, reason: "deferred_until_idle" });

    // Yeni paylaşımlı çağrı yumuşak erteleme tarafından bloklanmaz.
    await expect(coordinator.withSharedAccess(home, async () => "C")).resolves.toBe("C");

    // Aktif çağrılar bitince otomatik idle temizliği çalışır.
    releaseA();
    releaseB();
    await expect(Promise.all([callA, callB])).resolves.toEqual(["A", "B"]);
    await vi.waitFor(() => {
      expect(() => lstatSync(path.join(cliDir, "conversation_summaries.db"))).toThrow();
    });
    expect(readFileSync(path.join(cliDir, "antigravity-oauth-token"), "utf8")).toBe("token");

    // İnterval içinde tekrar tarama yapmaz.
    const intervalSkip = await coordinator.pruneIfNeeded(home, {
      softThresholdBytes: 10,
      hardThresholdBytes: 20,
      minCheckIntervalMs: 60_000,
    });
    expect(intervalSkip).toMatchObject({ pruned: false, reason: "interval" });

    // Sert eşik aktif çağrıyı bekletir, yenilerini durdurur ve bitince temizler.
    now += 120_000;
    let releaseD!: () => void;
    let dEntered!: () => void;
    const dReady = new Promise<void>((r) => {
      dEntered = r;
    });
    const callD = coordinator.withSharedAccess(home, async () => {
      dEntered();
      await new Promise<void>((r) => {
        releaseD = r;
      });
    });
    await dReady;

    await writeFile(path.join(cliDir, "jetbox_summaries_proto.pb"), "y".repeat(500));
    const hardPrune = coordinator.pruneIfNeeded(home, {
      softThresholdBytes: 100,
      hardThresholdBytes: 300,
      minCheckIntervalMs: 60_000,
    });
    await new Promise((r) => setTimeout(r, 15));

    let eRan = false;
    const callE = coordinator.withSharedAccess(home, async () => {
      eRan = true;
      return "E";
    });
    await new Promise((r) => setTimeout(r, 15));
    expect(eRan).toBe(false);

    releaseD();
    await callD;
    await expect(hardPrune).resolves.toMatchObject({ pruned: true, reason: "pruned" });
    await expect(callE).resolves.toBe("E");
    expect(eRan).toBe(true);
    expect(() => lstatSync(path.join(cliDir, "jetbox_summaries_proto.pb"))).toThrow();
  });

  it("coordinates across independent coordinator instances via real flock", async () => {
    const root = await makeTempDir("gemini-cross-proc-");
    const home = path.join(root, "gemini-home");
    await prepareGeminiEphemeralMountPoints(home);
    const cliDir = path.join(home, ".gemini", "antigravity-cli");
    await writeFile(path.join(cliDir, "conversation_summaries.db"), "sqlite-in-use".repeat(50));

    const probeCoord = new GeminiHomeCoordinator();
    const workerCoord = new GeminiHomeCoordinator();

    let releaseProbe!: () => void;
    let probeEntered!: () => void;
    const probeReady = new Promise<void>((r) => {
      probeEntered = r;
    });

    const probeCall = probeCoord.withSharedAccess(home, async () => {
      probeEntered();
      await new Promise<void>((r) => {
        releaseProbe = r;
      });
      return readFileSync(path.join(cliDir, "conversation_summaries.db"), "utf8");
    });
    await probeReady;

    // Ayrı koordinatör (worker) yumuşak temizlikte LOCK_SH tutan probe'un SQLite dosyasını SİLMEZ.
    const busyResult = await workerCoord.pruneIfNeeded(home, {
      softThresholdBytes: 100,
      hardThresholdBytes: 100_000,
      minCheckIntervalMs: 60_000,
    });
    expect(busyResult).toMatchObject({ pruned: false, reason: "lock_busy" });
    expect(lstatSync(path.join(cliDir, "conversation_summaries.db")).isFile()).toBe(true);

    // Probe bitmeden force temizlik bekler; probe biter bitmez temizler.
    const delayedForce = workerCoord.pruneIfNeeded(home, {
      force: true,
      exclusiveTimeoutMs: 5000,
    });
    await new Promise((r) => setTimeout(r, 40));
    expect(lstatSync(path.join(cliDir, "conversation_summaries.db")).isFile()).toBe(true);

    releaseProbe();
    await expect(probeCall).resolves.toContain("sqlite-in-use");
    await expect(delayedForce).resolves.toMatchObject({ pruned: true, reason: "pruned" });
    expect(() => lstatSync(path.join(cliDir, "conversation_summaries.db"))).toThrow();
  });

  it("evicts queued waiters on AbortSignal and deadline timeout without corrupting later calls", async () => {
    const root = await makeTempDir("gemini-waiter-cancel-");
    const home = path.join(root, "gemini-home");
    await prepareGeminiEphemeralMountPoints(home);
    const coordinator = new GeminiHomeCoordinator();

    let releaseHolder!: () => void;
    let holderEntered!: () => void;
    const holderReady = new Promise<void>((r) => {
      holderEntered = r;
    });
    const holder = coordinator.withSharedAccess(home, async () => {
      holderEntered();
      await new Promise<void>((r) => {
        releaseHolder = r;
      });
    });
    await holderReady;

    const forcedBarrier = coordinator.pruneIfNeeded(home, { force: true });

    const abortController = new AbortController();
    const abortedWaiter = coordinator.withSharedAccess(home, async () => "never", {
      signal: abortController.signal,
      onCancel: () => new Error("CUSTOM_CANCEL"),
    });
    abortController.abort();
    await expect(abortedWaiter).rejects.toThrow("CUSTOM_CANCEL");

    const timedOutWaiter = coordinator.withSharedAccess(home, async () => "never", {
      deadlineAtMs: Date.now() + 15,
      onTimeout: () => new Error("CUSTOM_TIMEOUT"),
    });
    await expect(timedOutWaiter).rejects.toThrow("CUSTOM_TIMEOUT");

    const survivor = coordinator.withSharedAccess(home, async () => "SURVIVED");
    releaseHolder();
    await holder;
    await forcedBarrier;
    await expect(survivor).resolves.toBe("SURVIVED");
  });
});
