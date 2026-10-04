import { describe, expect, it } from "vitest";
import {
  birthScanDue,
  rotateBirthParents,
  birthParentScanLimit,
} from "@/modules/agents/domain/birth-scheduling";
import { runRuntimeBirthTick } from "@/modules/agents/application/birth-candidates";
import type { DatabaseExecutor } from "@/lib/db/types";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";

const enabled = {
  birthMode: "CANDIDATES" as const,
  lastBirthScanAt: null,
  runtimeEnabled: true,
  schedulerEnabled: true,
  publishEnabled: true,
  publicWriteEnabled: true,
  runtimeOperatingMode: "NORMAL",
};
const now = new Date("2026-10-04T21:01:00Z");
describe("bounded birth scheduling", () => {
  it("rotates the start of the parent pool without changing data or using popularity", () => {
    const parents = ["a", "b", "c"];
    const today = rotateBirthParents(parents, now);
    expect(rotateBirthParents(parents, now)).toEqual(today);
    expect(rotateBirthParents(parents, new Date(now.getTime() + 86400000))[0]).not.toBe(today[0]);
    expect([...today].sort()).toEqual(parents);
    expect(parents).toEqual(["a", "b", "c"]);
    expect(rotateBirthParents([], now)).toEqual([]);
  });
  it("visits the 40-profile pool within five daily bounded scans", () => {
    const parents = Array.from({ length: 40 }, (_, id) => id);
    const visited = new Set<number>();
    for (let day = 0; day < 5; day += 1) {
      const batch = rotateBirthParents(parents, new Date(now.getTime() + day * 86400000)).slice(
        0,
        birthParentScanLimit,
      );
      expect(batch).toHaveLength(8);
      batch.forEach((id) => visited.add(id));
    }
    expect(visited.size).toBe(40);
  });
  it("uses Istanbul dates without allowing clock rollback to reopen a daily attempt", () => {
    expect(birthScanDue(enabled, now)).toBe(true);
    expect(
      birthScanDue({ ...enabled, lastBirthScanAt: new Date("2026-10-04T20:59:00Z") }, now),
    ).toBe(true);
    expect(
      birthScanDue({ ...enabled, lastBirthScanAt: new Date("2026-10-04T21:00:00Z") }, now),
    ).toBe(false);
    expect(
      birthScanDue({ ...enabled, lastBirthScanAt: new Date("2026-10-06T12:00:00Z") }, now),
    ).toBe(false);
  });
  it.each([
    { birthMode: "OFF" as const },
    { runtimeEnabled: false },
    { schedulerEnabled: false },
    { publishEnabled: false },
    { publicWriteEnabled: false },
    { runtimeOperatingMode: "MAINTENANCE" },
  ])("stays closed under %o", (patch) => {
    expect(birthScanDue({ ...enabled, ...patch }, now)).toBe(false);
  });
  it("reads only configuration while off, without touching history or candidate data", async () => {
    const db = {
      agentGlobalSettings: { findUniqueOrThrow: async () => ({ ...enabled, birthMode: "OFF" }) },
    } as unknown as DatabaseExecutor;
    expect(
      await runRuntimeBirthTick(db, {} as RuntimePrincipal, { workerId: "off-test" }, now),
    ).toEqual({ outcome: "OFF", candidateId: null });
  });
});
