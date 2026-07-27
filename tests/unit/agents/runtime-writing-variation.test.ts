import { describe, expect, it } from "vitest";
import {
  renderRuntimeWritingVariation,
  runtimeWritingVariation,
} from "@/runtime/writing-variation";

describe("runtime writing variation", () => {
  it("is deterministic for replay without exposing the run id", () => {
    const runId = "00000000-0000-4000-8000-000000000123";

    expect(runtimeWritingVariation(runId)).toEqual(runtimeWritingVariation(runId));
    expect(renderRuntimeWritingVariation(runId)).toBe(renderRuntimeWritingVariation(runId));
    expect(renderRuntimeWritingVariation(runId)).not.toContain(runId);
  });

  it("varies composition dimensions across runs instead of fixing one persona template", () => {
    const variations = Array.from({ length: 128 }, (_, index) =>
      runtimeWritingVariation(`00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`),
    );

    expect(
      new Set(variations.map(({ entryFunction }) => entryFunction)).size,
    ).toBeGreaterThanOrEqual(5);
    expect(new Set(variations.map(({ register }) => register)).size).toBeGreaterThanOrEqual(5);
    expect(
      new Set(variations.map(({ paragraphShape }) => paragraphShape)).size,
    ).toBeGreaterThanOrEqual(4);
    expect(new Set(variations.map(({ development }) => development)).size).toBeGreaterThanOrEqual(
      5,
    );
    expect(new Set(variations.map(({ ending }) => ending)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(variations.map(({ form }) => form))).toEqual(
      new Set(["MICRO", "SHORT", "MEDIUM", "LONG"]),
    );
    expect(new Set(variations.map((variation) => JSON.stringify(variation))).size).toBeGreaterThan(
      80,
    );
  });

  it("uses persona length as a tendency while keeping every form reachable", () => {
    const samples = Array.from(
      { length: 512 },
      (_, index) => `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
    );
    const count = (preference: "SHORT" | "MEDIUM" | "LONG" | "MIXED", form: string) =>
      samples.filter((runId) => runtimeWritingVariation(runId, preference).form === form).length;

    expect(count("SHORT", "MICRO")).toBeGreaterThan(count("LONG", "MICRO"));
    expect(count("LONG", "LONG")).toBeGreaterThan(count("SHORT", "LONG"));
    expect(count("SHORT", "MICRO") + count("SHORT", "SHORT")).toBeGreaterThan(
      count("SHORT", "MEDIUM") + count("SHORT", "LONG"),
    );
    expect(count("LONG", "MICRO") + count("LONG", "SHORT")).toBeGreaterThan(0);
    expect(count("LONG", "LONG")).toBeLessThan(samples.length / 3);
    for (const preference of ["SHORT", "MEDIUM", "LONG", "MIXED"] as const)
      expect(
        new Set(samples.map((runId) => runtimeWritingVariation(runId, preference).form)),
      ).toEqual(new Set(["MICRO", "SHORT", "MEDIUM", "LONG"]));
  });

  it("frames the selected dimensions as loose tendencies while preserving persona voice", () => {
    const prompt = renderRuntimeWritingVariation("00000000-0000-4000-8000-000000000456");

    expect(prompt).toContain("# Bu run için yazım varyasyonu");
    expect(prompt).toContain("- Form:");
    expect(prompt).toContain("- Sözlük işlevi:");
    expect(prompt).toContain("gözlemsel kalibrasyondur, kota değildir");
    expect(prompt).toContain("şablon veya kontrol listesi değildir");
    expect(prompt).toContain("tek başına okunabilir bir sözlük işlevi");
    expect(prompt).toContain("Personanın tanınabilir kelime seçimi");
    expect(prompt).toContain("Bu yönergeleri entry içinde anma");
    expect(prompt).not.toContain("Görüş → gerekçe");
  });
});
