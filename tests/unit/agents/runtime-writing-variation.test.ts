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
    expect(new Set(variations.map(({ opening }) => opening)).size).toBe(9);
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

  it("renders length, one approach hint and one shared boundary (v10)", () => {
    const prompt = renderRuntimeWritingVariation("00000000-0000-4000-8000-000000000456");

    expect(prompt.split("\n")).toEqual([
      "# Bu run için yazım varyasyonu",
      expect.stringMatching(/^- Form: /u),
      expect.stringMatching(/^Yaklaşım ipucu: .+ Konuya uymuyorsa kendi seçimini yap\.$/u),
      "Uydurma offline deneyim anlatma; açılış, gelişim ve kapanış şablonu kurma.",
    ]);
  });

  // 8 Ekim 2026: uzunluk personanın kendi aralığından, yaklaşım mizacından gelir.
  it("targets the persona's own word range in most runs", () => {
    const runIds = Array.from(
      { length: 400 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    const persona = {
      entryLength: "MEDIUM" as const,
      preferredMinWords: 45,
      preferredMaxWords: 210,
    };
    const lines = runIds.map(
      (runId) => renderRuntimeWritingVariation(runId, persona).split("\n")[1]!,
    );
    const inRange = lines.filter((line) =>
      /^Uzunluk: bu entry yaklaşık (45-128|128-210) kelime/u.test(line),
    );
    const short = lines.filter((line) => line.startsWith("Uzunluk: bu sefer kısa"));
    expect(inRange.length).toBeGreaterThan(300);
    expect(short.length).toBeGreaterThan(20);
    expect(short.length).toBeLessThan(110);
    expect(inRange.length + short.length).toBe(lines.length);
  });

  it("gives a humorous persona the humor hint far more often than a dry one", () => {
    const runIds = Array.from(
      { length: 600 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    const share = (humor: number) =>
      runIds.filter((runId) =>
        renderRuntimeWritingVariation(runId, {
          entryLength: "SHORT",
          temperament: { humor, skepticism: 0.4, curiosity: 0.4, directness: 0.5, conflict: 0.3 },
        }).includes("mizahını kullan"),
      ).length / runIds.length;
    expect(share(0.9)).toBeGreaterThan(0.35);
    expect(share(0.1)).toBeLessThan(0.05);
  });

  it("renders the exact instruction of the selected form for all four forms", () => {
    const expected = {
      MICRO: "Mikro form eğilimi: çoğu zaman 1-10 kelimelik",
      SHORT: "Kısa form eğilimi: çoğu zaman 11-30 kelime",
      MEDIUM: "Orta form eğilimi: çoğu zaman 31-100 kelime",
      LONG: "Uzun form erişilebilir: konu gerçekten taşıyorsa 100 kelimeyi aşabilirsin",
    } as const;
    const seen = new Set<string>();
    for (let index = 0; index < 256 && seen.size < 4; index += 1) {
      const runId = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      const { form } = runtimeWritingVariation(runId, "MIXED");
      const line = renderRuntimeWritingVariation(runId, "MIXED").split("\n")[1]!;
      expect(line.startsWith(`- Form: ${expected[form]}`), `${runId} ${form}`).toBe(true);
      seen.add(form);
    }
    expect(seen.size).toBe(4);
  });

  it("keeps the v8 selection so every run keeps its measured length form", () => {
    // Beklenen değerler `main`'deki sürüm 8 formülüyle (tohum v8) üretildi: render v9 olsa da
    // her koşu ölçülen talimattaki uzunluk formunu almalı (Astra f585cca P3).
    const v8: Array<[string, "SHORT" | "MEDIUM" | "LONG" | "MIXED", string]> = [
      ["00000000-0000-4000-8000-000000000001", "SHORT", "MICRO"],
      ["00000000-0000-4000-8000-000000000001", "MEDIUM", "SHORT"],
      ["00000000-0000-4000-8000-000000000001", "LONG", "SHORT"],
      ["00000000-0000-4000-8000-000000000001", "MIXED", "SHORT"],
      ["00000000-0000-4000-8000-000000000456", "SHORT", "SHORT"],
      ["00000000-0000-4000-8000-000000000456", "MEDIUM", "SHORT"],
      ["00000000-0000-4000-8000-000000000456", "LONG", "MEDIUM"],
      ["00000000-0000-4000-8000-000000000456", "MIXED", "SHORT"],
      ["11111111-2222-4333-8444-555555555555", "SHORT", "LONG"],
      ["11111111-2222-4333-8444-555555555555", "MEDIUM", "LONG"],
      ["11111111-2222-4333-8444-555555555555", "LONG", "LONG"],
      ["11111111-2222-4333-8444-555555555555", "MIXED", "LONG"],
      ["abfa8108-7034-4765-a945-8fc614ca4584", "SHORT", "SHORT"],
      ["abfa8108-7034-4765-a945-8fc614ca4584", "MEDIUM", "MEDIUM"],
      ["abfa8108-7034-4765-a945-8fc614ca4584", "LONG", "MEDIUM"],
      ["abfa8108-7034-4765-a945-8fc614ca4584", "MIXED", "MEDIUM"],
    ];
    for (const [runId, length, form] of v8)
      expect(runtimeWritingVariation(runId, length).form, `${runId} ${length}`).toBe(form);
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

/*
  27 Ağustos dersi ("izin ver, aynı cümlede yasakla" biçimi davranışı susturur) üslup turu 3'te
  de geçerli: bkz ve soru izni artık prompt-profile.ts üslup bloğunda, çekincesiz tek satır
  (tests/unit/agents/uslup-paragrafi.test.ts). Çeşitleme render'ı yalnız uzunluk formu taşır.
*/
describe("kip cümleleri izni kendi içinde geri almamalı", () => {
  it("renders no mode sentence that could carry a suppressing caveat", () => {
    const renders = Array.from({ length: 40 }, (_, index) =>
      renderRuntimeWritingVariation(`kip-taramasi-${index}`, "MIXED"),
    );
    const kipSatirlari = renders
      .flatMap((render) => render.split("\n"))
      .filter((line) => line.startsWith("- "));
    expect(kipSatirlari.every((line) => line.startsWith("- Form: "))).toBe(true);
  });
});
