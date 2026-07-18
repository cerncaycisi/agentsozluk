import { describe, expect, it } from "vitest";
import { generateDailyPlan } from "@/modules/agents/domain/scheduler";
import { defaultActiveTimeProfile } from "@/modules/agents/validation/schemas";

const profile = {
  agentProfileId: "00000000-0000-4000-8000-000000000001",
  entryMin: 15,
  entryMax: 20,
  topicMin: 0,
  topicMax: 2,
  voteMin: 0,
  voteMax: 10,
  activeTimeWeights: defaultActiveTimeProfile,
};

describe("deterministic daily agent planner", () => {
  it("generates an idempotent 15-20 target over 6-8 non-bunched runs", () => {
    const input = { localDate: new Date("2026-07-18T00:00:00.000Z"), settingsVersion: 3 };
    const first = generateDailyPlan(profile, input);
    expect(generateDailyPlan(profile, input)).toEqual(first);
    expect(first.entryTarget).toBeGreaterThanOrEqual(15);
    expect(first.entryTarget).toBeLessThanOrEqual(20);
    expect(first.slots.length).toBeGreaterThanOrEqual(6);
    expect(first.slots.length).toBeLessThanOrEqual(8);
    expect(first.slots.every(({ desiredEntryMax }) => [2, 3].includes(desiredEntryMax))).toBe(true);
    const times = first.slots.map(({ scheduledAt }) => scheduledAt.getTime());
    expect(
      times.every((value, index) => index === 0 || value - times[index - 1]! >= 20 * 60_000),
    ).toBe(true);
    for (const slot of first.slots) {
      const hourLoad = first.slots
        .filter(
          ({ scheduledAt }) =>
            scheduledAt <= slot.scheduledAt &&
            scheduledAt.getTime() > slot.scheduledAt.getTime() - 60 * 60_000,
        )
        .reduce((sum, { desiredEntryMax }) => sum + desiredEntryMax, 0);
      const threeHourLoad = first.slots
        .filter(
          ({ scheduledAt }) =>
            scheduledAt <= slot.scheduledAt &&
            scheduledAt.getTime() > slot.scheduledAt.getTime() - 3 * 60 * 60_000,
        )
        .reduce((sum, { desiredEntryMax }) => sum + desiredEntryMax, 0);
      expect(hourLoad).toBeLessThanOrEqual(4);
      expect(threeHourLoad).toBeLessThanOrEqual(9);
    }
  });

  it("changes deterministic output when the local date or settings version changes", () => {
    const first = generateDailyPlan(profile, {
      localDate: new Date("2026-07-18T00:00:00.000Z"),
      settingsVersion: 3,
    });
    const second = generateDailyPlan(profile, {
      localDate: new Date("2026-07-19T00:00:00.000Z"),
      settingsVersion: 3,
    });
    expect(second.randomSeed).not.toBe(first.randomSeed);
    expect(second.slots).not.toEqual(first.slots);
  });

  it("honors Istanbul window weights and the ten-agent 150-200 target envelope", () => {
    const counts = [0, 0, 0, 0, 0];
    let totalTarget = 0;
    for (let index = 0; index < 500; index += 1) {
      const plan = generateDailyPlan(
        { ...profile, agentProfileId: `agent-${index}` },
        { localDate: new Date("2026-07-18T00:00:00.000Z"), settingsVersion: 3 },
      );
      if (index < 10) totalTarget += plan.entryTarget;
      for (const slot of plan.slots) {
        const hour = (slot.scheduledAt.getUTCHours() + 3) % 24;
        const bucket =
          hour >= 7 && hour < 10
            ? 0
            : hour >= 10 && hour < 14
              ? 1
              : hour >= 14 && hour < 19
                ? 2
                : hour >= 19 && hour < 23
                  ? 3
                  : 4;
        counts[bucket]! += 1;
      }
    }
    const total = counts.reduce((sum, value) => sum + value, 0);
    const expected = [0.15, 0.3, 0.35, 0.17, 0.03];
    counts.forEach((count, index) => expect(count / total).toBeCloseTo(expected[index]!, 1));
    expect(totalTarget).toBeGreaterThanOrEqual(150);
    expect(totalTarget).toBeLessThanOrEqual(200);
  });
});
