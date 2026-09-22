import { z } from "zod";
import { normalizeEmail } from "@/modules/auth/domain/normalization";
import { CONTACT_MESSAGE_KINDS, isSameSitePath } from "@/modules/contact/domain/contact-message";

/*
  İletişim ve içerik kaldırma formu (22 Eylül 2026). Anonim ziyaretçi de
  gönderebilir; yanıt e-postası isteğe bağlıdır. Boş bırakılan isteğe bağlı
  alanlar tarayıcıdan boş dize olarak gelir; burada `undefined`'a çevrilir ki
  veritabanına boş dize yazılmasın.

  `subjectPath` kuralı alan katmanında: bkz. `isSameSitePath`.
*/
export const contactMessageKindSchema = z.enum(CONTACT_MESSAGE_KINDS);

const emailCheck = z.string().email();

/*
  Alt sınır karakter (Unicode kod noktası) sayar, UTF-16 birimi değil. Zod'un
  `.min()` birim sayar: "👍👍👍👍👍" 10 birimdir ama PostgreSQL `length()` 5
  karakter der; o fark uygulamada geçip veritabanı CHECK'inde düşen, yani 500
  dönen bir yazma üretiyordu (Sol, 22 Eylül). Üst sınırlar birimle kalabilir:
  birim sayısı karakter sayısından hiç küçük olmaz, yani `VARCHAR` tavanından
  daha sıkıdır.
*/
function atLeastCharacters(minimum: number) {
  return (value: string) => Array.from(value).length >= minimum;
}

/*
  PostgreSQL metin sütunu U+0000 saklayamaz; NUL içeren bir değer uygulamadan
  geçerse yazma veritabanında düşer ve 500 döner (Sol, 22 Eylül). Yanıt
  e-postası buna gerek duymaz: e-posta doğrulaması NUL'u zaten reddediyor.
*/
const NUL_MESSAGE = "Metin geçersiz bir karakter içeriyor.";

function hasNoNul(value: string) {
  return !value.includes("\u0000");
}

const subjectPathSchema = z
  .string()
  .trim()
  .max(500)
  .refine(hasNoNul, NUL_MESSAGE)
  .refine(
    (value) => value === "" || isSameSitePath(value),
    "Bu sitedeki bir adres olmalı (örnek: /baslik/agent-sozluk).",
  )
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const replyEmailSchema = z
  .string()
  .max(254)
  .transform(normalizeEmail)
  .refine(
    (value) => value === "" || emailCheck.safeParse(value).success,
    "Geçerli bir e-posta adresi girin.",
  )
  .transform((value) => (value === "" ? undefined : value))
  .optional();

export const contactMessageCreateSchema = z.object({
  kind: contactMessageKindSchema,
  subjectPath: subjectPathSchema,
  message: z
    .string()
    .trim()
    .max(4000)
    .refine(atLeastCharacters(10), "En az 10 karakter yazın.")
    .refine(hasNoNul, NUL_MESSAGE),
  replyEmail: replyEmailSchema,
});

export type ContactMessageCreateInput = z.infer<typeof contactMessageCreateSchema>;

/*
  Kapatma notu zorunlu: kullanıcıya "ne istendiği ve ne yapıldığı sonradan
  gösterilebilir" deniyor ve moderasyon arayüzü zaten en az 10 karakter
  istiyordu. Sunucunun daha gevşek olması o sözü delerdi (Sol, 22 Eylül).
*/
export const contactMessageHandleSchema = z.object({
  note: z
    .string()
    .trim()
    .max(1000)
    .refine(atLeastCharacters(10), "En az 10 karakter yazın.")
    .refine(hasNoNul, NUL_MESSAGE),
});

export type ContactMessageHandleInput = z.infer<typeof contactMessageHandleSchema>;
