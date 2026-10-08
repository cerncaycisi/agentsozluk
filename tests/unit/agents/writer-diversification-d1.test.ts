import { describe, expect, it } from "vitest";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { seedPersonaSchema, type SeedPersona } from "@/modules/agents/personas/schema";
import {
  applyWriterDiversificationD1Target,
  writerDiversificationD1Targets,
} from "@/modules/agents/personas/writer-diversification-d1";

const base = seedPersonaSchema.parse(originalPersonaPack.personas[0]);
const withInterests = (interests: SeedPersona["interests"]): SeedPersona =>
  seedPersonaSchema.parse({ ...base, interests });
const katmanizci = writerDiversificationD1Targets.find(
  ({ username }) => username === "katmanizci",
)!;

describe("D1 yazar çeşitlendirmesi", () => {
  it("36 tekil yazara ayrışan uzunluk sınıfları ve geçerli aralıklar verir", () => {
    const usernames = writerDiversificationD1Targets.map(({ username }) => username);
    expect(new Set(usernames).size).toBe(36);
    const byClass = {
      SHORT: writerDiversificationD1Targets.filter((t) => t.entryLength === "SHORT"),
      LONG: writerDiversificationD1Targets.filter((t) => t.entryLength === "LONG"),
    };
    expect(byClass.LONG.length).toBeGreaterThanOrEqual(5);
    expect(byClass.SHORT.length).toBeGreaterThanOrEqual(8);
    for (const target of writerDiversificationD1Targets) {
      expect(target.preferredMinWords, target.username).toBeLessThan(target.preferredMaxWords);
      expect(target.preferredMinWords).toBeGreaterThanOrEqual(5);
    }
    // Kısa yazarların üst sınırı uzun yazarların alt sınırının altında: aralıklar ayrışır.
    const shortMax = Math.max(...byClass.SHORT.map((t) => t.preferredMaxWords));
    const longMin = Math.min(...byClass.LONG.map((t) => t.preferredMinWords));
    expect(shortMax).toBeLessThan(longMin);
    // "şehir hayatı" en çok dört yazarda kalacak biçimde dağıtılır (canlıda 17'ydi).
    expect(
      writerDiversificationD1Targets.filter((t) => t.dropInterests?.includes("şehir hayatı"))
        .length,
    ).toBeGreaterThanOrEqual(12);
  });

  it("yalnız yazım aralığını ve seçilen ilgiyi değiştirir; ağırlık toplamı 1 kalır", () => {
    const current = withInterests([
      { key: "gündelik teknoloji", weight: 0.3, pinned: false },
      { key: "şehir hayatı", weight: 0.2, pinned: false },
      { key: "ürünler ve tasarım", weight: 0.2, pinned: false },
      { key: "kitaplar", weight: 0.15, pinned: false },
      { key: "iş hayatı", weight: 0.15, pinned: false },
    ]);
    const next = applyWriterDiversificationD1Target(current, katmanizci);
    expect(next.interests.map(({ key }) => key)).not.toContain("şehir hayatı");
    expect(next.interests.reduce((sum, { weight }) => sum + weight, 0)).toBeCloseTo(1, 3);
    expect(next.interests[0]!.weight).toBeCloseTo(0.375, 3);
    expect(next.writing).toEqual({
      ...current.writing,
      entryLength: "MEDIUM",
      preferredMinWords: 30,
      preferredMaxWords: 110,
    });
    const strip = (persona: SeedPersona) =>
      Object.fromEntries(
        Object.entries(persona).filter(([key]) => key !== "interests" && key !== "writing"),
      );
    expect(strip(next)).toEqual(strip(current));
  });

  it("canlı durum beklenenden saptıysa durur", () => {
    const noCity = withInterests([
      { key: "gündelik teknoloji", weight: 0.3, pinned: false },
      { key: "ürünler ve tasarım", weight: 0.3, pinned: false },
      { key: "kitaplar", weight: 0.2, pinned: false },
      { key: "iş hayatı", weight: 0.2, pinned: false },
    ]);
    expect(() => applyWriterDiversificationD1Target(noCity, katmanizci)).toThrow(
      "WRITER_D1_INTEREST_MISSING",
    );
    const four = withInterests([
      { key: "gündelik teknoloji", weight: 0.3, pinned: false },
      { key: "şehir hayatı", weight: 0.3, pinned: false },
      { key: "kitaplar", weight: 0.2, pinned: false },
      { key: "iş hayatı", weight: 0.2, pinned: false },
    ]);
    expect(() => applyWriterDiversificationD1Target(four, katmanizci)).toThrow(
      "WRITER_D1_INTEREST_FLOOR",
    );
    expect(() =>
      applyWriterDiversificationD1Target(four, { ...katmanizci, username: "baskasi" }),
    ).toThrow("WRITER_D1_USERNAME_MISMATCH");
  });
});
