import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendResetGeneration,
  initializeResetGenerationStore,
  readResetGenerationStore,
  requirePreResetRestoreGeneration,
  type ResetGenerationBinding,
} from "../../../scripts/reset-generation-store";

const ownedDirectories: string[] = [];
async function fixture() {
  const parent = await mkdtemp(join(homedir(), ".agentsozluk-generation-test-"));
  ownedDirectories.push(parent);
  const directory = join(parent, "private");
  await initializeResetGenerationStore(directory);
  const binding: ResetGenerationBinding = {
    operationId: randomUUID(),
    releaseSha: "a".repeat(40),
    dumpSha256: "b".repeat(64),
    manifestSha256: "c".repeat(64),
    planSha256: "e".repeat(64),
    implementationSha256: "f".repeat(64),
    backupClass: "PRE_RESET_BIGINT",
  };
  return { directory, binding };
}
afterEach(async () => {
  for (const path of ownedDirectories.splice(0)) await rm(path, { recursive: true });
});

describe("operator-private HMAC reset generation journal", () => {
  it("round-trips durable prefix bindings and closes pre-reset restore before traffic opens", async () => {
    const { directory, binding } = await fixture();
    const first = await appendResetGeneration(directory, null, { ...binding, state: "PREPARED" });
    expect(first.event.sequence).toBe(1);
    const firstBytes = await readFile(join(directory, "journal.jsonl"));
    const second = await appendResetGeneration(directory, first.event.hmac, {
      ...binding,
      state: "COMMITTED_MAINTENANCE",
      protectedSha256: "d".repeat(64),
      clearedCounts: { topics: 1, entries: 2 },
    });
    const secondBytes = await readFile(join(directory, "journal.jsonl"));
    expect(secondBytes.subarray(0, firstBytes.length).equals(firstBytes)).toBe(true);
    expect(secondBytes.subarray(firstBytes.length).toString().trim().split("\n")).toHaveLength(1);
    expect(requirePreResetRestoreGeneration(directory, binding).state).toBe(
      "COMMITTED_MAINTENANCE",
    );
    const third = await appendResetGeneration(directory, second.event.hmac, {
      ...binding,
      state: "TRAFFIC_OPEN",
      protectedSha256: "d".repeat(64),
      clearedCounts: { entries: 2, topics: 1 },
    });
    expect(third.event.previousHmac).toBe(second.event.hmac);
    const thirdBytes = await readFile(join(directory, "journal.jsonl"));
    expect(thirdBytes.subarray(0, secondBytes.length).equals(secondBytes)).toBe(true);
    expect(readResetGenerationStore(directory).events.map((e) => e.state)).toEqual([
      "PREPARED",
      "COMMITTED_MAINTENANCE",
      "TRAFFIC_OPEN",
    ]);
    // Aynı eski imzalı backup bağını vermek live dış kaydı geri çeviremez.
    expect(() => requirePreResetRestoreGeneration(directory, binding)).toThrow(
      "GREAT_RESET_PRE_RESET_RESTORE_FORBIDDEN",
    );
    await expect(
      appendResetGeneration(directory, third.event.hmac, {
        ...binding,
        state: "ROLLED_BACK",
        protectedSha256: "d".repeat(64),
        clearedCounts: { entries: 2, topics: 1 },
      }),
    ).rejects.toThrow("GREAT_RESET_GENERATION_TRANSITION_INVALID");
    expect(readResetGenerationStore(directory).events).toHaveLength(3);
  });
  it("rejects stale-prefix replay without changing the last durable record", async () => {
    const { directory, binding } = await fixture();
    const first = await appendResetGeneration(directory, null, { ...binding, state: "PREPARED" });
    const before = await readFile(join(directory, "journal.jsonl"), "utf8");
    await expect(
      appendResetGeneration(directory, null, { ...binding, state: "ABORTED" }),
    ).rejects.toThrow("GREAT_RESET_GENERATION_STALE_PREFIX");
    expect((await readFile(join(directory, "journal.jsonl"), "utf8")) === before).toBe(true);
    await appendResetGeneration(directory, first.event.hmac, { ...binding, state: "ABORTED" });
  });
  it("rejects dump/release/operation rebinding and missing commit proof before publication", async () => {
    const { directory, binding } = await fixture();
    const first = await appendResetGeneration(directory, null, { ...binding, state: "PREPARED" });
    await expect(
      appendResetGeneration(directory, first.event.hmac, {
        ...binding,
        state: "COMMITTED_MAINTENANCE",
      }),
    ).rejects.toThrow("GREAT_RESET_GENERATION_COMMIT_PROOF_REQUIRED");
    for (const patch of [
      { dumpSha256: "e".repeat(64) },
      { planSha256: "a".repeat(64) },
      { implementationSha256: "a".repeat(64) },
      { releaseSha: "e".repeat(40) },
      { operationId: randomUUID() },
    ])
      await expect(
        appendResetGeneration(directory, first.event.hmac, {
          ...binding,
          ...patch,
          state: "ABORTED",
        }),
      ).rejects.toThrow("GREAT_RESET_GENERATION_BINDING_MISMATCH");
    expect(readResetGenerationStore(directory).events).toHaveLength(1);
  });
  it("allows exactly one writer for a shared prefix and never retries the loser", async () => {
    const { directory, binding } = await fixture();
    const first = await appendResetGeneration(directory, null, { ...binding, state: "PREPARED" });
    const results = await Promise.allSettled(
      [0, 1].map(() =>
        appendResetGeneration(directory, first.event.hmac, { ...binding, state: "ABORTED" }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(
      rejected?.status === "rejected" &&
        /^GREAT_RESET_GENERATION_(BUSY|STALE_PREFIX)$/u.test(rejected.reason.message),
    ).toBe(true);
    expect(readResetGenerationStore(directory).events).toHaveLength(2);
  });
  it("rejects altered bytes and reordered signed history", async () => {
    const { directory, binding } = await fixture();
    const first = await appendResetGeneration(directory, null, { ...binding, state: "PREPARED" });
    await appendResetGeneration(directory, first.event.hmac, { ...binding, state: "ABORTED" });
    const path = join(directory, "journal.jsonl");
    const original = (await readFile(path, "utf8"))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    const changed = structuredClone(original);
    changed[0].dumpSha256 = "f".repeat(64);
    await writeFile(
      path,
      changed.map((event: unknown) => JSON.stringify(event)).join("\n") + "\n",
      { mode: 0o600 },
    );
    expect(() => readResetGenerationStore(directory)).toThrow(
      "GREAT_RESET_GENERATION_SIGNATURE_INVALID",
    );
    original.reverse();
    await writeFile(
      path,
      original.map((event: unknown) => JSON.stringify(event)).join("\n") + "\n",
      { mode: 0o600 },
    );
    expect(() => readResetGenerationStore(directory)).toThrow(
      "GREAT_RESET_GENERATION_TRANSITION_INVALID",
    );
  });
  it("rejects an exposed key or symlink and does not silently replace the key", async () => {
    const { directory, binding } = await fixture();
    const path = join(directory, "key");
    const original = await readFile(path);
    await expect(initializeResetGenerationStore(directory)).rejects.toThrow();
    expect((await readFile(path)).equals(original)).toBe(true);
    await chmod(path, 0o644);
    await expect(
      appendResetGeneration(directory, null, { ...binding, state: "PREPARED" }),
    ).rejects.toThrow("GREAT_RESET_GENERATION_PRIVATE_FILE_REQUIRED");
    await chmod(path, 0o600);
    const other = join(directory, "original-key");
    await writeFile(other, original, { mode: 0o600 });
    await unlink(path);
    await symlink(other, path);
    await expect(
      appendResetGeneration(directory, null, { ...binding, state: "PREPARED" }),
    ).rejects.toThrow("GREAT_RESET_GENERATION_PRIVATE_FILE_REQUIRED");
  });
});
