import { describe, expect, it } from "vitest";
import {
  admitResetGeneration,
  resetGenerationMirrorSchema,
  type ResetAdmissionEvidence,
  type ResetGenerationMirror,
} from "@/modules/maintenance/domain/reset-generation-admission";
const mirror: ResetGenerationMirror = {
  formatVersion: 1,
  operationId: "550e8400-e29b-41d4-a716-446655440000",
  releaseSha: "a".repeat(40),
  manifestSha256: "b".repeat(64),
  planSha256: "c".repeat(64),
  dumpSha256: "d".repeat(64),
  journalSha256: "e".repeat(64),
  state: "COMMITTED_MAINTENANCE",
  databaseName: "agent_sozluk",
  databaseOid: "16385",
  clusterId: "7663503447447879713",
  clearedCounts: { topics: 1, entries: 2 },
};
function evidence(): ResetAdmissionEvidence {
  return {
    databaseName: mirror.databaseName,
    databaseOid: mirror.databaseOid,
    clusterId: mirror.clusterId,
    commits: [
      {
        operationId: mirror.operationId,
        releaseSha: mirror.releaseSha,
        manifestSha256: mirror.manifestSha256,
        planSha256: mirror.planSha256,
        clearedCounts: mirror.clearedCounts,
      },
    ],
    exposures: [],
    topicTombstones: 1,
    entryTombstones: 2,
    writersFrozen: true,
    clearedEmpty: true,
    restores: [],
    openIntents: 0,
  };
}
function legacy(): ResetAdmissionEvidence {
  return { ...evidence(), commits: [], topicTombstones: 0, entryTombstones: 0 };
}
describe("external generation boot and backup replay admission", () => {
  it("allows the first installation, requires the mirror once latched and rejects an old empty-journal backup after traffic", () => {
    expect(admitResetGeneration(null, legacy(), false)).toBe("LEGACY");
    expect(() => admitResetGeneration(null, legacy(), true)).toThrow(
      "GREAT_RESET_GENERATION_ADMISSION_REJECTED",
    );
    expect(() =>
      admitResetGeneration({ ...mirror, state: "TRAFFIC_OPEN" }, legacy(), true),
    ).toThrow();
    expect(() => admitResetGeneration(null, evidence(), false)).toThrow();
  });
  it("allows frozen inner acceptance and then demands the matching durable exposure before normal boot", () => {
    expect(admitResetGeneration(mirror, evidence(), true)).toBe("RESET");
    expect(() =>
      admitResetGeneration({ ...mirror, state: "TRAFFIC_OPEN" }, evidence(), true),
    ).toThrow();
    const after = {
      ...evidence(),
      writersFrozen: false,
      clearedEmpty: false,
      exposures: [{ operationId: mirror.operationId, journalSha256: mirror.journalSha256 }],
    };
    expect(admitResetGeneration({ ...mirror, state: "TRAFFIC_OPEN" }, after, true)).toBe("RESET");
  });
  it.each([
    { databaseOid: "999" },
    { clusterId: "999" },
    { databaseName: "other" },
    { topicTombstones: 0 },
    { entryTombstones: 3 },
    { writersFrozen: false },
    { clearedEmpty: false },
    { commits: [] },
    { commits: [...evidence().commits, ...evidence().commits] },
    { restores: [{ operationId: mirror.operationId, dumpSha256: mirror.dumpSha256 }] },
  ])("rejects identity, archive and pretraffic state drift %j", (patch) =>
    expect(() => admitResetGeneration(mirror, { ...evidence(), ...patch }, true)).toThrow(),
  );
  it.each(["operationId", "releaseSha", "manifestSha256", "planSha256"] as const)(
    "rejects stale commit binding %s",
    (key) => {
      const commit = { ...evidence().commits[0]!, [key]: "f".repeat(64) };
      expect(() =>
        admitResetGeneration(mirror, { ...evidence(), commits: [commit] }, true),
      ).toThrow();
    },
  );
  it("rejects missing or changed count proofs and wrong exposure generation", () => {
    for (const clearedCounts of [
      { topics: 1 },
      { topics: 1, entries: 2, other: 0 },
      { topics: 1, entries: 3 },
      null,
    ])
      expect(() =>
        admitResetGeneration(
          mirror,
          { ...evidence(), commits: [{ ...evidence().commits[0]!, clearedCounts }] },
          true,
        ),
      ).toThrow();
    expect(() =>
      admitResetGeneration(
        { ...mirror, state: "TRAFFIC_OPEN" },
        {
          ...evidence(),
          exposures: [{ operationId: mirror.operationId, journalSha256: "f".repeat(64) }],
        },
        true,
      ),
    ).toThrow();
  });
  it("admits rollback only with the same restore audit, invalidated intents and empty reset proofs", () => {
    const restored = {
      ...legacy(),
      databaseOid: "999",
      restores: [
        {
          operationId: mirror.operationId,
          dumpSha256: mirror.dumpSha256,
          restoredDatabaseOid: "999",
        },
      ],
    };
    const rollbackMirror = { ...mirror, state: "ROLLED_BACK" as const, restoredDatabaseOid: "999" };
    expect(admitResetGeneration(rollbackMirror, restored, true)).toBe("LEGACY");
    expect(() =>
      admitResetGeneration(rollbackMirror, { ...restored, openIntents: 1 }, true),
    ).toThrow();
    expect(() =>
      admitResetGeneration(rollbackMirror, { ...restored, restores: [] }, true),
    ).toThrow();
    expect(() =>
      admitResetGeneration(rollbackMirror, { ...restored, databaseOid: mirror.databaseOid }, true),
    ).toThrow();
    expect(() =>
      admitResetGeneration({ ...mirror, state: "ROLLED_BACK" }, restored, true),
    ).toThrow();
    expect(() =>
      admitResetGeneration({ ...mirror, restoredDatabaseOid: "999" }, evidence(), true),
    ).toThrow();
  });
  it("rejects malformed and additional mirror fields", () => {
    expect(resetGenerationMirrorSchema.safeParse({ ...mirror, databaseOid: "" }).success).toBe(
      false,
    );
    expect(resetGenerationMirrorSchema.safeParse({ ...mirror, ignored: true }).success).toBe(false);
  });
});
