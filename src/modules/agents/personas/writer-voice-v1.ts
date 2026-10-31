import {
  personaVoiceSchema,
  seedPersonaSchema,
  type SeedPersona,
} from "@/modules/agents/personas/schema";
import voiceCards from "./writer-voice-v1.json";

/*
  Ses kartları V1 (1 Kasım 2026). Gökhan: "hepsini aynı kişi yazıyor gibi; hiçbirinin özgün tarzı
  yok; biri makale, diğeri tek kelime yazsın". 36 yazara Fable'ın yazdığı kartlar (uzunluk kimliği,
  ritim, tavır, sözcükler, en çok üç tik, mizah, takıntı, "asla", üç örnek). Yerel deneme (48 koşu,
  canlı yedekten kopya, luna max): kör yazar tanıma 18/30 → 26/30; Gökhan ölçütüyle kalite
  2,83 → 2,98, ≥4 alan 6/36 → 11/41; makaleci 169–181 kelime, 3–4 paragraf; tek satırcı 5–14
  kelime. Uygulama `scripts/apply-writer-voice-v1.ts` (DRY_RUN → PAUSE → APPLY).
*/
export const WRITER_VOICE_V1_VERSION = 1;

const cardSchema = personaVoiceSchema.extend({
  username: seedPersonaSchema.shape.username,
  preferredMinWords: seedPersonaSchema.shape.writing.shape.preferredMinWords,
  preferredMaxWords: seedPersonaSchema.shape.writing.shape.preferredMaxWords,
});

export type WriterVoiceV1Target = ReturnType<typeof cardSchema.parse>;

export const writerVoiceV1Targets: readonly WriterVoiceV1Target[] = (
  voiceCards as { kartlar: unknown[] }
).kartlar.map((card) => cardSchema.parse(card));

export function applyWriterVoiceV1Target(
  currentPersona: SeedPersona,
  target: WriterVoiceV1Target,
): SeedPersona {
  if (currentPersona.username !== target.username)
    throw new Error(
      `WRITER_VOICE_V1_USERNAME_MISMATCH current=${currentPersona.username} target=${target.username}`,
    );
  const { preferredMinWords, preferredMaxWords, ...card } = target;
  const voice = Object.fromEntries(Object.entries(card).filter(([key]) => key !== "username"));
  return seedPersonaSchema.parse({
    ...currentPersona,
    writing: { ...currentPersona.writing, preferredMinWords, preferredMaxWords },
    voice,
  });
}
