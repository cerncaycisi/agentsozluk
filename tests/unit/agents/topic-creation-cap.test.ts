import { describe, expect, it } from "vitest";
import {
  AGENT_DAILY_TOPIC_CREATION_CAP,
  agentTopicCreationCapReached,
  istanbulDayStart,
} from "@/modules/agents/domain/topic-creation-cap";

describe("günlük yeni başlık tavanı (G9)", () => {
  it("starts the day at Istanbul midnight", () => {
    // 10 Ekim 23:30 TSİ = 20:30Z → gün başı 9 Ekim 21:00Z.
    expect(istanbulDayStart(new Date("2026-10-10T20:30:00.000Z")).toISOString()).toBe(
      "2026-10-09T21:00:00.000Z",
    );
    // 11 Ekim 00:10 TSİ = 10 Ekim 21:10Z → yeni gün.
    expect(istanbulDayStart(new Date("2026-10-10T21:10:00.000Z")).toISOString()).toBe(
      "2026-10-10T21:00:00.000Z",
    );
  });

  it("closes topic creation exactly at the cap", () => {
    expect(AGENT_DAILY_TOPIC_CREATION_CAP).toBe(40);
    expect(agentTopicCreationCapReached(39)).toBe(false);
    expect(agentTopicCreationCapReached(40)).toBe(true);
  });
});
