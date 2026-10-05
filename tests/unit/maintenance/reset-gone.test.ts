import { describe, expect, it, vi } from "vitest";
import { resetGoneCandidate } from "@/modules/maintenance/domain/reset-gone";
import { getResetGoneDecision } from "@/modules/maintenance/application/reset-gone";
import type { DatabaseClient } from "@/lib/db/types";

const uuid = "550e8400-e29b-41d4-a716-446655440000";
function fixture(commit: boolean, live: boolean, tombstone: boolean, operationId = "reset") {
  return {
    $executeRaw: vi.fn(async () => 0),
    greatResetCommit: { findFirst: vi.fn(async () => (commit ? { operationId: "reset" } : null)) },
    topic: { findUnique: vi.fn(async () => (live ? { id: uuid } : null)) },
    entry: { findUnique: vi.fn(async () => (live ? { id: uuid } : null)) },
    greatResetTombstone: {
      findMany: vi.fn(async () =>
        tombstone && operationId === "reset" ? [{ kind: "ENTRY", uuid, publicId: 42n }] : [],
      ),
    },
  };
}

describe("reset gone boundary", () => {
  it.each([
    "/baslik/açılmamış",
    "/entry/0",
    "/entry/01",
    "/entry/2147483648",
    "/baslik/yeni--2147483648",
    "/entry/9007199254740993",
    "/entry/12/revizyonlar",
  ])("bypasses DB for %s", (path) => {
    expect(resetGoneCandidate("GET", path)).toBeNull();
  });
  it("uses the existing canonical and legacy parsers", () => {
    expect(resetGoneCandidate("HEAD", "/baslik/eski--42")).toEqual({
      kind: "TOPIC",
      reference: "PUBLIC_ID",
      publicId: 42,
    });
    expect(resetGoneCandidate("GET", `/baslik/${uuid}-eski`)).toEqual({
      kind: "TOPIC",
      reference: "UUID",
      uuid,
    });
    expect(resetGoneCandidate("GET", `/entry/${uuid}`)).toEqual({
      kind: "ENTRY",
      reference: "UUID",
      uuid,
    });
    expect(resetGoneCandidate("POST", "/entry/42")).toBeNull();
  });
  it.each([
    [false, false, false, "PASS"],
    [true, true, true, "PASS"],
    [true, false, false, "PASS"],
    [true, false, true, "GONE"],
  ] as const)(
    "commit=%s live=%s tombstone=%s yields %s",
    async (commit, live, tombstone, result) => {
      const tx = fixture(commit, live, tombstone);
      expect(
        await getResetGoneDecision(tx as unknown as DatabaseClient, {
          kind: "ENTRY",
          reference: "PUBLIC_ID",
          publicId: 42,
        }),
      ).toBe(result);
      if (!commit) {
        expect(tx.entry.findUnique).not.toHaveBeenCalled();
        expect(tx.greatResetTombstone.findMany).not.toHaveBeenCalled();
      }
      if (live) expect(tx.entry.findUnique).toHaveBeenCalled();
    },
  );
  it("refuses a tombstone bound to another commit", async () => {
    const tx = fixture(true, false, true, "different");
    expect(
      await getResetGoneDecision(tx as unknown as DatabaseClient, {
        kind: "TOPIC",
        reference: "UUID",
        uuid,
      }),
    ).toBe("PASS");
    expect(tx.greatResetTombstone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { operationId: "reset" }, take: 1000 }),
    );
    expect(tx.topic.findUnique).not.toHaveBeenCalled();
  });
});
