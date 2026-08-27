import { z } from "zod";
import { entryBodySchema } from "@/modules/entries/validation/schemas";
import { normalizeTopicTitle } from "@/modules/topics/domain/normalization";

/*
  Yön denetimleri: gömme, geçersiz kılma ve yalıtım işaretleri (U+202A-202E,
  U+2066-2069) ile soldan/sağdan işaretleri (U+200E, U+200F). Bunlar metnin
  görüntülenme sırasını değiştirir — `masum⁧kötü` ekranda bambaşka okunabilir.
  Sözlük başlığında meşru kullanımları yok ve görünen başlıkta kalmaları
  kimlik sahteciliği yüzeyidir, o yüzden gösterilen metinden de atılıyorlar.

  Diğer görünmez karakterler (sıfır genişlikli boşluk, ZWJ, yumuşak tire)
  gösterilen başlıkta korunur; onların kopya üretmesi `normalizeTopicTitle`
  içinde karşılaştırma anahtarından atılarak engellenir.
*/
const bidiControlPattern = /[‎‏‪-‮⁦-⁩]/gu;

export const topicTitleSchema = z.string().transform((input, context) => {
  const displayTitle = input
    .normalize("NFKC")
    .replaceAll(bidiControlPattern, "")
    .trim()
    .replaceAll(/\r\n?|\n/gu, " ")
    .replaceAll(/\s+/gu, " ");
  const normalizedTitle = normalizeTopicTitle(displayTitle);
  const length = [...normalizedTitle].length;
  if (length < 2)
    context.addIssue({ code: "custom", message: "Başlık en az 2 karakter olmalıdır." });
  if (length > 100)
    context.addIssue({ code: "custom", message: "Başlık en fazla 100 karakter olabilir." });
  return displayTitle;
});

/**
 * URL'den okunmuş bir başlık adayının API sözleşmesinden geçip geçmediği.
 * Kural tek yerde duruyor: sayfa da POST da `topicTitleSchema`'dan geçiyor,
 * böylece adres çubuğuna yazılan başlık için gösterilen composer'ın gönderimi
 * sonradan reddedilmiyor. Dönen metin, başlık açılsa nasıl kaydedilecekse odur.
 */
export function parseProposedTopicTitle(input: string): string | null {
  const result = topicTitleSchema.safeParse(input);
  return result.success ? result.data : null;
}

export const topicCreateSchema = z.object({
  title: topicTitleSchema,
  entryBody: entryBodySchema,
  canonicalOverride: z.boolean().optional(),
});

export type TopicCreateInput = z.infer<typeof topicCreateSchema>;
