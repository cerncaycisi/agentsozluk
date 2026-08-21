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
    expect(new Set(variations.map(({ opening }) => opening)).size).toBe(8);
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
    expect(prompt).toContain("- Açılış:");
    expect(prompt).toContain("- Sözlük işlevi:");
    expect(prompt).toContain("gözlemsel kalibrasyondur, kota değildir");
    expect(prompt).toContain("şablon veya kontrol listesi değildir");
    expect(prompt).toContain("tek başına okunabilir bir sözlük işlevi");
    expect(prompt).toContain("Personanın tanınabilir kelime seçimi");
    expect(prompt).toContain("Bu yönergeleri entry içinde anma");
    expect(
      Array.from({ length: 128 }, (_, index) =>
        renderRuntimeWritingVariation(
          `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
        ),
      ).join("\n"),
    ).toMatch(/gizli \[\[başlık\]\]|görünür \(bkz: başlık\)/u);
    expect(prompt).toMatch(
      /başlığı yeniden söylemeden|somut ve ayırt edici|gündelik ve tek başına|kişisel görüş|çekince veya istisna|ayırt edici fark|kısa itiraz veya soru|kısa bir iddia/u,
    );
    expect(prompt).not.toContain("Görüş → gerekçe");
  });
});

describe("soru izni", () => {
  /*
    27 Tem 2026'daki `4d78e96` `openingModes`'u bütünüyle kaldırdı ve sistemdeki tek
    soru üreticisi iki satır onunla gitti. Niyet münazara iskeletini atmaktı; soru
    yan hasardı. Canlı ölçüm: 23 Tem %27,8 (anayasa günü, düşüş yok) → 27 Tem %4,3
    (bu commit) → 28 Tem %0,18.

    Bu test yasağın sessizce geri gelmesini engelliyor.
  */
  /* Modlar dışa açık değil; deterministik seçiciyi birçok run id ile örnekleyip topluyoruz. */
  const tumModlar = (alan: "opening" | "ending") => {
    const kume = new Set<string>();
    for (let i = 0; i < 400; i += 1)
      kume.add(
        runtimeWritingVariation(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`)[alan],
      );
    return [...kume];
  };

  it("açılışta soruya izin veren bir mod var", () => {
    const izin = tumModlar("opening").filter((mod) => /soru/iu.test(mod));
    expect(izin.length).toBeGreaterThan(0);
    // İzin cümlesi kendi içinde soruyu yasaklamamalı.
    for (const mod of izin) expect(mod).not.toMatch(/soru\s+(sorma|kurma|yöneltme|ekleme)/iu);
  });

  it("kapanış yasağı soruyu kapsamıyor", () => {
    // Çağrı ve tartışma daveti yasağı KALSIN; anayasa forum çağrısını yasaklıyor.
    const yasak = tumModlar("ending").filter((mod) => /eklemeden bitir/iu.test(mod));
    expect(yasak.length).toBeGreaterThan(0);
    for (const mod of yasak) expect(mod).not.toMatch(/^Soru,/u);
  });
});
