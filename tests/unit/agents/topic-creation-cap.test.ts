import { describe, expect, it } from "vitest";
import {
  AGENT_DAILY_PROPER_NOUN_TOPIC_CAP,
  PROPER_NOUN_TOPIC_CAP_REASON,
  agentProperNounTopicCapReached,
  isProperNounTopicTitle,
  istanbulDayStart,
  istanbulQuotaDay,
  properNounCapRejectionDetail,
  readProperNounCapRejectionDetail,
} from "@/modules/agents/domain/topic-creation-cap";
import {
  isRepairableContentRejectionCode,
  isTitleRepairableContentRejectionCode,
} from "@/modules/agents/domain/action-policy";

describe("günlük özel adlı yeni başlık tavanı (17 Ekim)", () => {
  it.each(["Türkşeker", "İETT", "The Wayfinder", "2026 Yaşayan Gezegen Raporu", "İzmir", "Şile"])(
    "treats %s as a proper-noun (news/entity) title",
    (title) => {
      expect(isProperNounTopicTitle(title)).toBe(true);
    },
  );

  it.each([
    "tesis yönetimi",
    "petrol arzı",
    "iş garantisi",
    "2026 mimarlık haftası",
    "ışık şöleni",
    "çöğüş",
  ])("treats %s as a lowercase concept title", (title) => {
    expect(isProperNounTopicTitle(title)).toBe(false);
  });

  it("classifies compatibility forms by their stored NFKC shape", () => {
    // Tam genişlikli "Ａ" NFKC ile "A" olur; saklanan başlık da büyük harf taşır.
    expect(isProperNounTopicTitle("Ａbc")).toBe(true);
    expect(isProperNounTopicTitle("ａbc")).toBe(false);
  });

  it("does not count a Unicode titlecase (Lt) letter as uppercase", () => {
    // Astra tavan 1. tur P3: libc `[[:upper:]]` "ᾈ" harfini sayabilir; alan kuralı yalnız Lu.
    expect(isProperNounTopicTitle("ᾈλφα")).toBe(false);
  });

  it("names the Istanbul quota day across both midnights", () => {
    expect(istanbulQuotaDay(new Date("2026-10-17T20:59:59.999Z"))).toBe("2026-10-17");
    expect(istanbulQuotaDay(new Date("2026-10-17T21:00:00.000Z"))).toBe("2026-10-18");
    expect(istanbulQuotaDay(new Date("2026-10-18T00:30:00.000Z"))).toBe("2026-10-18");
  });

  it("stores and reads back only a well-formed cap detail", () => {
    const detail = properNounCapRejectionDetail(new Date("2026-10-17T12:00:00Z"));
    expect(detail).toEqual({ subReason: "PROPER_NOUN_DAILY_CAP", quotaDay: "2026-10-17" });
    expect(readProperNounCapRejectionDetail({ valid: false, rejectionDetail: detail })).toEqual(
      detail,
    );
    for (const validationResult of [
      null,
      "PROPER_NOUN_DAILY_CAP",
      { valid: false },
      { rejectionDetail: { subReason: "OTHER", quotaDay: "2026-10-17" } },
      { rejectionDetail: { subReason: "PROPER_NOUN_DAILY_CAP", quotaDay: "17.10.2026" } },
      { rejectionDetail: { subReason: "PROPER_NOUN_DAILY_CAP", quotaDay: 20261017 } },
    ])
      expect(readProperNounCapRejectionDetail(validationResult)).toBeNull();
  });

  it("starts the day at Istanbul midnight", () => {
    // 17 Ekim 23:59 TSİ = 20:59Z → gün başı 16 Ekim 21:00Z.
    expect(istanbulDayStart(new Date("2026-10-17T20:59:59.999Z")).toISOString()).toBe(
      "2026-10-16T21:00:00.000Z",
    );
    // 18 Ekim 00:00 TSİ = 17 Ekim 21:00Z → yeni gün tam bu anda başlar.
    expect(istanbulDayStart(new Date("2026-10-17T21:00:00.000Z")).toISOString()).toBe(
      "2026-10-17T21:00:00.000Z",
    );
    // UTC gece yarısı İstanbul gününü değiştirmez: 18 Ekim 00:30Z = 18 Ekim 03:30 TSİ.
    expect(istanbulDayStart(new Date("2026-10-18T00:30:00.000Z")).toISOString()).toBe(
      "2026-10-17T21:00:00.000Z",
    );
  });

  it("closes proper-noun topic creation exactly at the cap", () => {
    expect(AGENT_DAILY_PROPER_NOUN_TOPIC_CAP).toBe(30);
    expect(agentProperNounTopicCapReached(0)).toBe(false);
    expect(agentProperNounTopicCapReached(29)).toBe(false);
    expect(agentProperNounTopicCapReached(30)).toBe(true);
    expect(agentProperNounTopicCapReached(31)).toBe(true);
  });

  it("is a plain action rejection that content repair never retries", () => {
    expect(isRepairableContentRejectionCode("TOPIC_CREATION_DISABLED")).toBe(false);
    expect(isTitleRepairableContentRejectionCode("TOPIC_CREATION_DISABLED")).toBe(false);
  });

  it("tells the agent where to write instead", () => {
    expect(PROPER_NOUN_TOPIC_CAP_REASON).toContain("özel adlı yeni başlık tavanı doldu");
    expect(PROPER_NOUN_TOPIC_CAP_REASON).toContain("kavram başlığı");
  });
});
