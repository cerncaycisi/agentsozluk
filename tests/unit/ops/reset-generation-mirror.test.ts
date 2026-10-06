import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertResetMirrorPublication,
  resetGenerationLatchFromMirror,
  resetGenerationMirrorFromStore,
} from "../../../scripts/reset-generation-mirror";
import {
  appendResetGeneration,
  initializeResetGenerationStore,
} from "../../../scripts/reset-generation-store";
import type { ResetGenerationMirror } from "@/modules/maintenance/domain/reset-generation-admission";
const mirror: ResetGenerationMirror = {
  formatVersion: 1,
  operationId: randomUUID(),
  releaseSha: "a".repeat(40),
  dumpSha256: "b".repeat(64),
  manifestSha256: "c".repeat(64),
  planSha256: "d".repeat(64),
  journalSha256: "e".repeat(64),
  state: "COMMITTED_MAINTENANCE",
  databaseName: "agent_sozluk",
  databaseOid: "16385",
  clusterId: "7663503447447879713",
  clearedCounts: { topics: 1, entries: 2 },
};
describe("kalıcı nesil latch ve mirror yayını", () => {
  it("ilk yayını COMMITTED ile sınırlar; latch yokluğu, nesil değişimi ve terminal geriye sarma reddedilir", () => {
    const required = resetGenerationLatchFromMirror(mirror);
    expect(() => assertResetMirrorPublication(null, null, mirror)).not.toThrow();
    expect(() =>
      assertResetMirrorPublication(null, null, { ...mirror, state: "TRAFFIC_OPEN" }),
    ).toThrow();
    expect(() => assertResetMirrorPublication(null, required, mirror)).toThrow();
    expect(() => assertResetMirrorPublication(mirror, null, mirror)).toThrow();
    expect(() =>
      assertResetMirrorPublication(mirror, required, { ...mirror, operationId: randomUUID() }),
    ).toThrow();
    expect(() =>
      assertResetMirrorPublication(mirror, required, {
        ...mirror,
        clearedCounts: { topics: 0, entries: 2 },
      }),
    ).toThrow();
    const opened = { ...mirror, state: "TRAFFIC_OPEN" as const, journalSha256: "f".repeat(64) };
    expect(() => assertResetMirrorPublication(mirror, required, opened)).not.toThrow();
    expect(() => assertResetMirrorPublication(opened, required, opened)).not.toThrow();
    expect(() => assertResetMirrorPublication(opened, required, mirror)).toThrow();
    expect(() =>
      assertResetMirrorPublication(opened, required, { ...mirror, state: "ROLLED_BACK" }),
    ).toThrow();
  });
  it("yalnız imzalı güncel operatör prefix'ten mirror üretir; PREPARED yayımlanamaz", async () => {
    const parent = await mkdtemp(join(homedir(), ".agentsozluk-generation-mirror-"));
    try {
      const directory = join(parent, "private");
      await initializeResetGenerationStore(directory);
      const binding = {
        operationId: mirror.operationId,
        releaseSha: mirror.releaseSha,
        dumpSha256: mirror.dumpSha256,
        manifestSha256: mirror.manifestSha256,
        planSha256: mirror.planSha256,
        implementationSha256: "f".repeat(64),
        backupClass: "PRE_RESET_BIGINT" as const,
      };
      const first = await appendResetGeneration(directory, null, { ...binding, state: "PREPARED" });
      const identity = {
        databaseName: mirror.databaseName,
        databaseOid: mirror.databaseOid,
        clusterId: mirror.clusterId,
      };
      expect(() => resetGenerationMirrorFromStore(directory, identity)).toThrow(
        "GREAT_RESET_GENERATION_MIRROR_STATE_INVALID",
      );
      const second = await appendResetGeneration(directory, first.event.hmac, {
        ...binding,
        state: "COMMITTED_MAINTENANCE",
        protectedSha256: "e".repeat(64),
        clearedCounts: mirror.clearedCounts,
      });
      expect(resetGenerationMirrorFromStore(directory, identity)).toEqual({
        ...mirror,
        journalSha256: second.journalSha256,
      });
      const third = await appendResetGeneration(directory, second.event.hmac, {
        ...binding,
        state: "TRAFFIC_OPEN",
        protectedSha256: "e".repeat(64),
        clearedCounts: mirror.clearedCounts,
      });
      expect(resetGenerationMirrorFromStore(directory, identity)).toEqual({
        ...mirror,
        state: "TRAFFIC_OPEN",
        journalSha256: third.journalSha256,
      });
    } finally {
      await rm(parent, { recursive: true });
    }
  });
  it("atomic restore rename sonrası yeni OID'yi imzalar; değişmez latch source OID'yi korur", async () => {
    const parent = await mkdtemp(join(homedir(), ".agentsozluk-generation-restore-"));
    try {
      const directory = join(parent, "private");
      await initializeResetGenerationStore(directory);
      const binding = {
        operationId: mirror.operationId,
        releaseSha: mirror.releaseSha,
        dumpSha256: mirror.dumpSha256,
        manifestSha256: mirror.manifestSha256,
        planSha256: mirror.planSha256,
        implementationSha256: "f".repeat(64),
        backupClass: "PRE_RESET_BIGINT" as const,
      };
      const first = await appendResetGeneration(directory, null, { ...binding, state: "PREPARED" });
      const commit = {
        ...binding,
        protectedSha256: "e".repeat(64),
        clearedCounts: mirror.clearedCounts,
      };
      const second = await appendResetGeneration(directory, first.event.hmac, {
        ...commit,
        state: "COMMITTED_MAINTENANCE",
      });
      await expect(
        appendResetGeneration(directory, second.event.hmac, { ...commit, state: "ROLLED_BACK" }),
      ).rejects.toThrow("GREAT_RESET_GENERATION_RESTORE_OID_REQUIRED");
      const identity = {
        databaseName: mirror.databaseName,
        databaseOid: mirror.databaseOid,
        clusterId: mirror.clusterId,
      };
      const prior = resetGenerationMirrorFromStore(directory, identity);
      await appendResetGeneration(directory, second.event.hmac, {
        ...commit,
        state: "ROLLED_BACK",
        restoredDatabaseOid: "999",
      });
      const restored = resetGenerationMirrorFromStore(directory, identity);
      expect(restored.databaseOid).toBe("16385");
      expect(restored.restoredDatabaseOid).toBe("999");
      expect(resetGenerationLatchFromMirror(restored)).toEqual(
        resetGenerationLatchFromMirror(prior),
      );
      expect(() =>
        assertResetMirrorPublication(prior, resetGenerationLatchFromMirror(prior), restored),
      ).not.toThrow();
      expect(() =>
        assertResetMirrorPublication(restored, resetGenerationLatchFromMirror(prior), {
          ...restored,
          restoredDatabaseOid: "1000",
        }),
      ).toThrow();
    } finally {
      await rm(parent, { recursive: true });
    }
  });
});
