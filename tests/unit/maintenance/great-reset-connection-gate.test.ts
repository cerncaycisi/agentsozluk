import { describe, expect, it } from "vitest";
import { otherTargetBackends } from "@/modules/maintenance/repository/great-reset-connection-gate";

describe("great reset connection gate backend count", () => {
  it("reads startup locks before refreshing and counting visible sessions, in separate queries", async () => {
    const order: string[] = [];
    const control = {
      $queryRaw: (strings: TemplateStringsArray) => {
        const sql = strings.join("?");
        if (sql.includes("pg_locks")) {
          order.push("locks");
          return Promise.resolve([{ starting: 0 }]);
        }
        if (sql.includes("pg_stat_clear_snapshot")) {
          order.push("clear");
          return Promise.resolve([{ ok: 1 }]);
        }
        order.push(sql.includes("pg_stat_activity") ? "activity" : "other");
        expect(sql).not.toContain("pg_locks");
        return Promise.resolve([{ pinned: 1, others: 0, prepared: 0 }]);
      },
    };
    await expect(otherTargetBackends(control as never, "agent_sozluk", 42)).resolves.toEqual({
      pinned: 1,
      others: 0,
      prepared: 0,
      starting: 0,
    });
    expect(order).toEqual(["locks", "clear", "activity"]);
  });
});
