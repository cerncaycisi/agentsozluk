import { describe, expect, it } from "vitest";
import {
  allocateDegradedPlanCapacity,
  calculateAdaptiveContentRunCount,
  catchUpWindowForLocalMinute,
  generateDailyPlan,
} from "@/modules/agents/domain/scheduler";
import { defaultActiveTimeProfile } from "@/modules/agents/validation/schemas";
import { adminDailyPlanRegenerationSchema } from "@/modules/agents/validation/scheduling-schemas";

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
  it("requires a bounded reason for an admin same-day regeneration", () => {
    expect(adminDailyPlanRegenerationSchema.safeParse({}).success).toBe(false);
    expect(
      adminDailyPlanRegenerationSchema.parse({
        localDate: "2026-07-18",
        reason: "Recalculate the remaining schedule after quota review.",
      }),
    ).toMatchObject({
      localDate: new Date("2026-07-18T00:00:00.000Z"),
      reason: "Recalculate the remaining schedule after quota review.",
    });
  });

  it("derives the 6-8 run envelope from target, measured p75, capacity and observed yield", () => {
    expect(
      calculateAdaptiveContentRunCount({
        entryTarget: 20,
        measuredP75DurationMs: 180_000,
        availableCapacityMinutes: 30,
        historicalSuccessRate: 1,
        historicalEntriesPerSuccessfulRun: 3,
      }),
    ).toBe(7);
    expect(
      calculateAdaptiveContentRunCount({
        entryTarget: 20,
        measuredP75DurationMs: 180_000,
        availableCapacityMinutes: 30,
        historicalSuccessRate: 0.6,
        historicalEntriesPerSuccessfulRun: 2,
      }),
    ).toBe(8);
    expect(
      calculateAdaptiveContentRunCount({
        entryTarget: 20,
        measuredP75DurationMs: 300_000,
        availableCapacityMinutes: 30,
        historicalSuccessRate: 0.6,
        historicalEntriesPerSuccessfulRun: 2,
      }),
    ).toBe(6);
    expect(
      calculateAdaptiveContentRunCount({
        entryTarget: 0,
        measuredP75DurationMs: 180_000,
        availableCapacityMinutes: 30,
        historicalSuccessRate: 1,
        historicalEntriesPerSuccessfulRun: 3,
      }),
    ).toBe(0);
  });

  it("opens bounded early, mid-day and evening catch-up windows", () => {
    expect(catchUpWindowForLocalMinute(9 * 60 + 59)).toBeNull();
    expect(catchUpWindowForLocalMinute(10 * 60)).toMatchObject({
      phase: "EARLY",
      expectedProgress: 0.15,
      maximumRuns: 2,
    });
    expect(catchUpWindowForLocalMinute(14 * 60)).toMatchObject({
      phase: "MID",
      expectedProgress: 0.45,
      maximumRuns: 2,
    });
    expect(catchUpWindowForLocalMinute(20 * 60)).toMatchObject({
      phase: "EVENING",
      expectedProgress: 1,
      maximumRuns: 3,
    });
    expect(catchUpWindowForLocalMinute(23 * 60 + 30)).toBeNull();
  });

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

  it("regenerates only future slots while respecting retained loads and occupied minutes", () => {
    const localDate = new Date("2026-07-18T00:00:00.000Z");
    const now = new Date("2026-07-18T12:34:56.000Z");
    const occupied = new Date("2026-07-18T13:30:00.000Z");
    const retained = {
      scheduledAt: new Date("2026-07-18T13:00:00.000Z"),
      desiredEntryMin: 1,
      desiredEntryMax: 2,
    };
    const input = {
      localDate,
      settingsVersion: 4,
      seedNamespace: "regen-v1",
      capacityStrategy: {
        entryTarget: 5,
        topicTarget: 0,
        voteTarget: 0,
        contentRunCount: 3,
        maxDesiredEntry: 3 as const,
      },
      scheduleConstraints: {
        notBefore: now,
        fixedSlots: [retained],
        excludedScheduledAt: [occupied],
      },
    };
    const plan = generateDailyPlan(profile, input);
    expect(generateDailyPlan(profile, input)).toEqual(plan);
    expect(plan.slots).toHaveLength(3);
    expect(plan.slots.every(({ scheduledAt }) => scheduledAt > now)).toBe(true);
    expect(plan.slots.some(({ scheduledAt }) => scheduledAt.getTime() === occupied.getTime())).toBe(
      false,
    );
    expect(
      plan.slots.every(
        ({ scheduledAt }) =>
          Math.abs(scheduledAt.getTime() - retained.scheduledAt.getTime()) >= 20 * 60_000,
      ),
    ).toBe(true);
  });

  it("fails closed instead of placing an impossible remaining plan in the past", () => {
    expect(() =>
      generateDailyPlan(profile, {
        localDate: new Date("2026-07-18T00:00:00.000Z"),
        settingsVersion: 4,
        capacityStrategy: {
          entryTarget: 2,
          topicTarget: 0,
          voteTarget: 0,
          contentRunCount: 2,
          maxDesiredEntry: 3,
        },
        scheduleConstraints: { notBefore: new Date("2026-07-18T20:50:00.000Z") },
      }),
    ).toThrow(/rate limit/iu);
  });

  it.each([
    { target: 0, expectedRuns: 0, attainable: 0 },
    { target: 1, expectedRuns: 1, attainable: 1 },
    { target: 5, expectedRuns: 5, attainable: 5 },
    { target: 24, expectedRuns: 8, attainable: 24 },
    { target: 25, expectedRuns: 8, attainable: 24 },
    { target: 100, expectedRuns: 8, attainable: 24 },
  ])(
    "keeps target $target while planning $expectedRuns non-zero slots with $attainable attainable entries",
    ({ target, expectedRuns, attainable }) => {
      const plan = generateDailyPlan(
        { ...profile, entryMin: target, entryMax: target },
        { localDate: new Date("2026-07-18T00:00:00.000Z"), settingsVersion: 3 },
      );
      expect(plan.entryTarget).toBe(target);
      expect(plan.slots).toHaveLength(expectedRuns);
      expect(plan.slots.reduce((sum, slot) => sum + slot.desiredEntryMax, 0)).toBe(attainable);
      expect(
        plan.slots.every(
          (slot) =>
            slot.desiredEntryMin >= 1 &&
            slot.desiredEntryMax >= slot.desiredEntryMin &&
            slot.desiredEntryMax <= 3,
        ),
      ).toBe(true);
    },
  );

  it("compresses a target to six runs with at most four entries without shrinking it", () => {
    const localDate = new Date("2026-07-18T00:00:00.000Z");
    const baseline = generateDailyPlan(
      { ...profile, entryMin: 20, entryMax: 20 },
      {
        localDate,
        settingsVersion: 3,
      },
    );
    const input = {
      localDate,
      settingsVersion: 3,
      capacityStrategy: {
        entryTarget: baseline.entryTarget,
        topicTarget: baseline.topicTarget,
        voteTarget: baseline.voteTarget,
        contentRunCount: 6,
        maxDesiredEntry: 4 as const,
      },
    };
    const adapted = generateDailyPlan(profile, input);
    expect(generateDailyPlan(profile, input)).toEqual(adapted);
    expect(adapted).toMatchObject({
      entryTarget: 20,
      topicTarget: baseline.topicTarget,
      voteTarget: baseline.voteTarget,
    });
    expect(adapted.slots).toHaveLength(6);
    expect(adapted.slots.reduce((sum, slot) => sum + slot.desiredEntryMax, 0)).toBe(20);
    expect(adapted.slots.every((slot) => slot.desiredEntryMax <= 4)).toBe(true);
  });

  it("caps a degraded target of 100 at six runs and explicitly shrinks it to 24", () => {
    const [allocation] = allocateDegradedPlanCapacity([100], 100);
    expect(allocation).toEqual({ contentRunCount: 6, entryTarget: 24 });

    const degraded = generateDailyPlan(
      { ...profile, entryMin: 100, entryMax: 100 },
      {
        localDate: new Date("2026-07-18T00:00:00.000Z"),
        settingsVersion: 3,
        capacityStrategy: {
          ...allocation!,
          topicTarget: 0,
          voteTarget: 0,
          maxDesiredEntry: 4,
        },
      },
    );
    expect(degraded.entryTarget).toBe(24);
    expect(degraded.slots).toHaveLength(6);
    expect(degraded.slots.reduce((sum, slot) => sum + slot.desiredEntryMax, 0)).toBe(24);
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
