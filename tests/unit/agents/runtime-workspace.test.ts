import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelRuntimeWorkDirectoryExpiry,
  cleanupExpiredRuntimeWork,
  finalizeRuntimeWorkDirectory,
  RETAINED_RUNTIME_WORK_FILES,
  scheduleRuntimeWorkDirectoryExpiry,
} from "@/runtime/codex-cli-provider";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "agent-sozluk-runtime-work-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("runtime work directory lifecycle", () => {
  it("removes the whole isolated run directory when debug retention is disabled", async () => {
    const root = await temporaryRoot();
    const workDirectory = path.join(root, "run");
    await mkdir(workDirectory);
    await writeFile(path.join(workDirectory, "output.json"), "{}", { mode: 0o600 });

    await finalizeRuntimeWorkDirectory(workDirectory, 0);

    await expect(access(workDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("retains only allowlisted regular output files with owner-only permissions", async () => {
    const root = await temporaryRoot();
    const workDirectory = path.join(root, "run");
    const outside = path.join(root, "outside.txt");
    await mkdir(workDirectory);
    await writeFile(outside, "outside");
    await Promise.all([
      writeFile(path.join(workDirectory, "output.json"), "{}", { mode: 0o644 }),
      writeFile(path.join(workDirectory, "output.schema.json"), "{}", { mode: 0o644 }),
      writeFile(path.join(workDirectory, "stderr.log"), "must not remain"),
      mkdir(path.join(workDirectory, "nested")),
      symlink(outside, path.join(workDirectory, "context-link.json")),
    ]);

    await finalizeRuntimeWorkDirectory(workDirectory, 1);

    expect((await readdir(workDirectory)).sort()).toEqual([...RETAINED_RUNTIME_WORK_FILES].sort());
    for (const file of RETAINED_RUNTIME_WORK_FILES) {
      const metadata = await lstat(path.join(workDirectory, file));
      expect(metadata.isFile()).toBe(true);
      expect(metadata.mode & 0o777).toBe(0o600);
    }
    expect(await access(outside).then(() => true)).toBe(true);
  });

  it("cleans only retained run directories older than the current DB retention window", async () => {
    const root = await temporaryRoot();
    const expired = path.join(root, "expired");
    const current = path.join(root, "current");
    await Promise.all([mkdir(expired), mkdir(current)]);
    const nowMs = Date.now();
    await utimes(
      expired,
      new Date(nowMs - 2 * 60 * 60 * 1000),
      new Date(nowMs - 2 * 60 * 60 * 1000),
    );

    await cleanupExpiredRuntimeWork(root, 1, nowMs);

    await expect(access(expired)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(current)).resolves.toBeUndefined();
  });

  it("removes stale retained work after DB retention is switched back to zero", async () => {
    const root = await temporaryRoot();
    const stale = path.join(root, "stale-retained-run");
    const active = path.join(root, "active-run");
    await Promise.all([mkdir(stale), mkdir(active)]);
    const nowMs = Date.now();
    await utimes(stale, new Date(nowMs - 30 * 60 * 1000), new Date(nowMs - 30 * 60 * 1000));

    await cleanupExpiredRuntimeWork(root, 0, nowMs);

    await expect(access(stale)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(active)).resolves.toBeUndefined();
  });

  it("deletes the final retained run at its own expiry even when no later invocation starts", async () => {
    vi.useFakeTimers();
    const root = await temporaryRoot();
    const workDirectory = path.join(root, "last-retained-run");
    await mkdir(workDirectory);
    await writeFile(path.join(workDirectory, "output.json"), "{}", { mode: 0o600 });

    scheduleRuntimeWorkDirectoryExpiry(workDirectory, 1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000 - 1);
    await expect(access(workDirectory)).resolves.toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();
    await vi.waitFor(
      async () => await expect(access(workDirectory)).rejects.toMatchObject({ code: "ENOENT" }),
      { timeout: 1000 },
    );
  });

  it("cancels the previous expiry before the same run directory is reused", async () => {
    vi.useFakeTimers();
    const root = await temporaryRoot();
    const workDirectory = path.join(root, "retried-run");
    await mkdir(workDirectory);
    scheduleRuntimeWorkDirectoryExpiry(workDirectory, 1);

    await vi.advanceTimersByTimeAsync(59 * 60 * 1000);
    cancelRuntimeWorkDirectoryExpiry(workDirectory);
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    await expect(access(workDirectory)).resolves.toBeUndefined();

    scheduleRuntimeWorkDirectoryExpiry(workDirectory, 1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    vi.useRealTimers();
    await vi.waitFor(
      async () => await expect(access(workDirectory)).rejects.toMatchObject({ code: "ENOENT" }),
      { timeout: 1000 },
    );
  });

  it("rejects retention outside the admin-enforced zero-to-twenty-four-hour range", async () => {
    const root = await temporaryRoot();
    await expect(finalizeRuntimeWorkDirectory(root, 25)).rejects.toThrow(/0–24/u);
  });
});
