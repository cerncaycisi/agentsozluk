import { lstatSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  GEMINI_EPHEMERAL_STATE_DIRS,
  GEMINI_PRUNABLE_STATE_FILES,
  GeminiHomeCoordinator,
  geminiEphemeralTmpfsArgs,
  inspectGeminiHomeState,
  prepareGeminiEphemeralMountPoints,
  pruneGeminiHomeStateFiles,
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
    expect(result.pruned).toBe(true);
    expect(result.reason).toBe("pruned");
    expect(result.deletedFiles).toBe(GEMINI_PRUNABLE_STATE_FILES.length - 1);
    expect(result.deletedEntries).toBe(3);

    expect(readFileSync(outsideVictim, "utf8")).toBe("DO_NOT_DELETE");
    expect(lstatSync(path.join(cliDir, "conversation_summaries.db")).isSymbolicLink()).toBe(true);
    expect(readFileSync(outsideLogTarget, "utf8")).toBe("LOG_TARGET_KEEP");
    expect(() => lstatSync(path.join(cliDir, "cli.log"))).toThrow();
    expect(readFileSync(path.join(cliDir, "antigravity-oauth-token"), "utf8")).toBe("oauth-token");
    expect(readFileSync(path.join(cliDir, "installation_id"), "utf8")).toBe("install-123");
    expect(readFileSync(path.join(cliDir, "jetski_state.pbtxt"), "utf8")).toBe("state-pb");
    expect(readFileSync(path.join(cliDir, "builtin", "keep.txt"), "utf8")).toBe("keep-me");

    for (const [name] of GEMINI_EPHEMERAL_STATE_DIRS) {
      const target = path.join(cliDir, name);
      expect(lstatSync(target).isDirectory()).toBe(true);
      expect(await readdir(target)).toEqual([]);
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
    let maxParallel = 0;
    let currentParallel = 0;
    let aEntered!: () => void;
    let bEntered!: () => void;
    const aReady = new Promise<void>((r) => {
      aEntered = r;
    });
    const bReady = new Promise<void>((r) => {
      bEntered = r;
    });

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

    // Aktif çağrı bitince otomatik idle temizliği çalışır.
    releaseA();
    releaseB();
    await expect(Promise.all([callA, callB])).resolves.toEqual(["A", "B"]);
    await new Promise((r) => setTimeout(r, 20));
    expect(() => lstatSync(path.join(cliDir, "conversation_summaries.db"))).toThrow();
    expect(readFileSync(path.join(cliDir, "antigravity-oauth-token"), "utf8")).toBe("token");

    // İnterval içinde tekrar gereksiz tarama yapmaz.
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
    await new Promise((r) => setTimeout(r, 10));

    let eRan = false;
    const callE = coordinator.withSharedAccess(home, async () => {
      eRan = true;
      return "E";
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(eRan).toBe(false);

    releaseD();
    await callD;
    await expect(hardPrune).resolves.toMatchObject({ pruned: true, reason: "pruned" });
    await expect(callE).resolves.toBe("E");
    expect(eRan).toBe(true);
    expect(() => lstatSync(path.join(cliDir, "jetbox_summaries_proto.pb"))).toThrow();
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
