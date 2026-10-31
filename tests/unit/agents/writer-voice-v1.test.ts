import { describe, expect, it } from "vitest";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { renderPersonaPrompt } from "@/modules/agents/personas/prompt-renderer";
import { seedPersonaSchema } from "@/modules/agents/personas/schema";
import {
  applyWriterVoiceV1Target,
  writerVoiceV1Targets,
} from "@/modules/agents/personas/writer-voice-v1";
import {
  renderRuntimeWritingVariation,
  renderEntryAngleReminder,
} from "@/runtime/writing-variation";

// Ses kartları V1 (1 Kasım 2026): 36 kart, şemaya uygun, küçük harf, sona soru yok.
describe("ses kartları V1", () => {
  it("36 farklı yazara uzunluk kimliği dağılımıyla kart verir", () => {
    expect(writerVoiceV1Targets).toHaveLength(36);
    expect(new Set(writerVoiceV1Targets.map(({ username }) => username)).size).toBe(36);
    const counts = Object.fromEntries(
      ["MAKALE", "TEK_SATIR", "KISA", "ORTA", "KARMA"].map((identity) => [
        identity,
        writerVoiceV1Targets.filter(({ lengthIdentity }) => lengthIdentity === identity).length,
      ]),
    );
    expect(counts).toEqual({ MAKALE: 5, TEK_SATIR: 6, KISA: 8, ORTA: 10, KARMA: 7 });
  });

  it("örnekler küçük harfli ve soruyla bitmez", () => {
    for (const card of writerVoiceV1Targets)
      for (const { entry } of card.examples) {
        expect(entry).toBe(entry.toLocaleLowerCase("tr-TR"));
        expect(entry.trim().endsWith("?")).toBe(false);
      }
  });

  it("uygulama ses kartını ve uzunluğu yazar, başka alana dokunmaz ve idempotenttir", () => {
    const base = seedPersonaSchema.parse(originalPersonaPack.personas[0]);
    const card = { ...writerVoiceV1Targets[0]!, username: base.username };
    const applied = applyWriterVoiceV1Target(base, card);
    expect(applied.voice?.lengthIdentity).toBe(card.lengthIdentity);
    expect(applied.writing.preferredMinWords).toBe(card.preferredMinWords);
    expect({ ...applied, voice: undefined, writing: base.writing }).toEqual({
      ...base,
      voice: undefined,
    });
    expect(applyWriterVoiceV1Target(applied, card)).toEqual(applied);
    expect(() => applyWriterVoiceV1Target(base, { ...card, username: "baska_yazar" })).toThrow(
      "WRITER_VOICE_V1_USERNAME_MISMATCH",
    );
  });

  it("kartlı persona isteminde ses kartı ve uzunluk kimliği görünür; kartsızda görünmez", () => {
    const base = seedPersonaSchema.parse(originalPersonaPack.personas[0]);
    const card = {
      ...writerVoiceV1Targets.find(({ lengthIdentity }) => lengthIdentity === "MAKALE")!,
      username: base.username,
    };
    const prompt = renderPersonaPrompt(applyWriterVoiceV1Target(base, card));
    expect(prompt).toContain("# Sesin (ses kartı)");
    expect(prompt).toContain("Uzun yazan birisin");
    expect(renderPersonaPrompt(base)).not.toContain("# Sesin");
  });

  it("kartlı yazara açı ya da yaklaşım atanmaz; uzunluk kimlikten gelir", () => {
    const runId = "00000000-0000-4000-8000-000000000501";
    const text = renderRuntimeWritingVariation(
      runId,
      { entryLength: "MIXED", lengthIdentity: "TEK_SATIR" },
      { lensGuidance: true },
    );
    expect(text).not.toContain("Yaklaşım ipucu");
    expect(text).not.toContain("Bu entry'nin açısı");
    expect(text).toMatch(/Uzunluk: (tek kelime|tek satır)/u);
    expect(
      renderEntryAngleReminder(runId, { entryLength: "MIXED", lengthIdentity: "KARMA" }),
    ).toContain("ses kartındaki sesinle");
  });
});
