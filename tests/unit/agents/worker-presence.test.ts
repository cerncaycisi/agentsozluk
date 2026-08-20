import { describe, expect, it } from "vitest";
import { deriveWorkerPresence } from "@/modules/agents/repository/capacity";

const now = new Date("2026-08-20T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

const liveSlot = { leaseRemainingMs: 45_000, heartbeatAgeMs: 8_000 };
const expiredSlot = { leaseRemainingMs: 0, heartbeatAgeMs: 600_000 };
const emptySlot = { leaseRemainingMs: null, heartbeatAgeMs: null };

/*
  Üç heartbeat tek etikete indirgeniyordu. Bu testler üç durumun gerçekten
  ayrıştığını sabitler; özellikle "roster bayat ama lease canlı" hâli, eskiden
  operatöre "runtime öldü" diye gösterilen ve müdahaleye yol açan durumdur.
*/
describe("deriveWorkerPresence", () => {
  it("reports ONLINE while the roster heartbeat is fresh, regardless of lanes", () => {
    expect(deriveWorkerPresence({ rosterSyncedAt: minutesAgo(1), now, slots: [emptySlot] })).toBe(
      "ONLINE",
    );
    expect(deriveWorkerPresence({ rosterSyncedAt: minutesAgo(1), now, slots: [] })).toBe("ONLINE");
  });

  it("treats the roster boundary itself as fresh and one millisecond past it as stale", () => {
    const boundary = new Date(now.getTime() - 120_000);
    expect(deriveWorkerPresence({ rosterSyncedAt: boundary, now, slots: [] })).toBe("ONLINE");
    expect(
      deriveWorkerPresence({ rosterSyncedAt: new Date(boundary.getTime() - 1), now, slots: [] }),
    ).toBe("ROSTER_STALE_NO_LEASE");
  });

  it("keeps a stale roster with a live lease separate from a missing worker", () => {
    expect(
      deriveWorkerPresence({ rosterSyncedAt: minutesAgo(5), now, slots: [emptySlot, liveSlot] }),
    ).toBe("ROSTER_STALE_LEASE_ACTIVE");
  });

  it("does not call an expired lease alive even while the run row still says RUNNING", () => {
    expect(deriveWorkerPresence({ rosterSyncedAt: minutesAgo(5), now, slots: [expiredSlot] })).toBe(
      "ROSTER_STALE_NO_LEASE",
    );
  });

  it("does not call an unexpired lease alive when its heartbeat went stale", () => {
    expect(
      deriveWorkerPresence({
        rosterSyncedAt: minutesAgo(5),
        now,
        slots: [{ leaseRemainingMs: 240_000, heartbeatAgeMs: 121_000 }],
      }),
    ).toBe("ROSTER_STALE_NO_LEASE");
  });

  it("separates a worker that never reported from one that stopped reporting", () => {
    expect(deriveWorkerPresence({ rosterSyncedAt: null, now, slots: [liveSlot] })).toBe(
      "NEVER_REPORTED",
    );
  });
});
