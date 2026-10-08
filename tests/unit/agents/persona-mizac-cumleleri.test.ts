import { describe, expect, it } from "vitest";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { renderPersonaPrompt } from "@/modules/agents/personas/prompt-renderer";
import { seedPersonaSchema, type SeedPersona } from "@/modules/agents/personas/schema";
import { renderRuntimeWritingVariation } from "@/runtime/writing-variation";

// Astra hakem turu (8 Ekim 2026): mizaç boyutu kaybı, çatışma çelişkisi ve eşit aralık.
const base = seedPersonaSchema.parse(originalPersonaPack.personas[0]);
const withTemperament = (patch: Partial<SeedPersona["temperament"]>): SeedPersona => ({
  ...base,
  temperament: { ...base.temperament, ...patch },
});

describe("persona mizaç cümleleri", () => {
  it("her mizaç boyutu, uç olmayan değişim dahil, isteme ulaşır", () => {
    for (const key of Object.keys(base.temperament) as Array<keyof SeedPersona["temperament"]>) {
      const low = renderPersonaPrompt(withTemperament({ [key]: 0.5 }));
      const nudged = renderPersonaPrompt(withTemperament({ [key]: 0.51 }));
      expect(nudged, key).not.toBe(low);
    }
  });

  it("belirsizliğe tolerans uçlarda davranış cümlesi üretir", () => {
    expect(renderPersonaPrompt(withTemperament({ uncertaintyTolerance: 0.9 }))).toContain(
      "Belirsizlikle rahatsın",
    );
    expect(renderPersonaPrompt(withTemperament({ uncertaintyTolerance: 0.1 }))).toContain(
      "Belirsiz kalmaktan hoşlanmazsın",
    );
  });

  it("düşük çatışma eğilimi ve düşük eşik birlikte 'küçük anlaşmazlıkta bile itiraz' demez", () => {
    const prompt = renderPersonaPrompt({
      ...withTemperament({ conflict: 0.08 }),
      conflict: { ...base.conflict, threshold: 0.18 },
    });
    expect(prompt).not.toContain("Küçük bir anlaşmazlıkta bile itirazını söylersin.");
    expect(prompt).toContain("itiraz etmek yerine kendi gözlemini eklersin");
    const combative = renderPersonaPrompt({
      ...withTemperament({ conflict: 0.7 }),
      conflict: { ...base.conflict, threshold: 0.18 },
    });
    expect(combative).toContain("Küçük bir anlaşmazlıkta bile itirazını söylersin.");
  });

  it("depodaki hiçbir persona çatışma cümlelerini birlikte almaz", () => {
    for (const raw of originalPersonaPack.personas) {
      const prompt = renderPersonaPrompt(seedPersonaSchema.parse(raw));
      const avoids = prompt.includes("Kavgaya girmekten kaçınırsın.");
      expect(avoids && prompt.includes("Küçük bir anlaşmazlıkta bile itirazını söylersin.")).toBe(
        false,
      );
    }
  });
});

describe("eşit kelime aralığı", () => {
  it("min=max geçerli aralıktır, eski forma düşmez", () => {
    const rendered = renderRuntimeWritingVariation("00000000-0000-4000-8000-000000000001", {
      entryLength: "MEDIUM",
      preferredMinWords: 100,
      preferredMaxWords: 100,
    });
    expect(rendered).not.toContain("- Form: ");
  });
});
