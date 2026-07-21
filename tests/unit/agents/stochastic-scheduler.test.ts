import { describe, expect, it } from "vitest";
import {
  selectStochasticWakeCandidates,
  stochasticDispatchProbability,
  stochasticTickKey,
  stochasticTickShouldDispatch,
  type StochasticActiveTimeProfile,
} from "@/modules/agents/domain/stochastic-scheduler";

const profile: StochasticActiveTimeProfile = {
  "07:00-10:00": 0.15,
  "10:00-14:00": 0.3,
  "14:00-19:00": 0.35,
  "19:00-23:00": 0.17,
  "23:00-07:00": 0.03,
};

describe("stochastic society scheduler", () => {
  it("uses bounded one-minute idempotency buckets", () => {
    expect(stochasticTickKey(new Date("2026-07-21T12:32:59.999Z"))).toBe(
      "2026-07-21T12:32:00.000Z",
    );
    expect(stochasticTickKey(new Date("2026-07-21T12:33:00.000Z"))).toBe(
      "2026-07-21T12:33:00.000Z",
    );
  });

  it("keeps nights open but much quieter than the daytime peak", () => {
    const peak = stochasticDispatchProbability(profile, new Date("2026-07-21T08:00:00.000Z"));
    const night = stochasticDispatchProbability(profile, new Date("2026-07-21T23:00:00.000Z"));
    expect(peak).toBe(1);
    expect(night).toBeCloseTo(0.05, 5);
    expect(night).toBeGreaterThan(0);
  });

  it("makes a retry in the same tick deterministic", () => {
    const input = { tickKey: "2026-07-21T12:34:00.000Z", probability: 0.42, seed: "v7" };
    expect(stochasticTickShouldDispatch(input)).toBe(stochasticTickShouldDispatch(input));
  });

  it("selects without replacement and excludes an agent that just ran", () => {
    const now = new Date("2026-07-21T12:32:00.000Z");
    const selected = selectStochasticWakeCandidates({
      candidates: [
        { id: "agent-a", activeTimeProfile: profile, lastRunAt: null },
        { id: "agent-b", activeTimeProfile: profile, lastRunAt: new Date(now.getTime() - 60_000) },
        {
          id: "agent-c",
          activeTimeProfile: profile,
          lastRunAt: new Date(now.getTime() - 60 * 60_000),
        },
      ],
      count: 2,
      now,
      seed: "tick-1",
    });
    expect(selected).toHaveLength(2);
    expect(new Set(selected.map(({ id }) => id)).size).toBe(2);
    expect(selected.map(({ id }) => id)).not.toContain("agent-b");
  });
});
