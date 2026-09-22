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
  Kalıcılık yolunun saklayamadığı iki şey şemada reddedilir; yoksa uygulama
  kabul eder, yazma 500 döner (Sol, 22 Eylül):
  - U+0000: PostgreSQL metin sütunu saklayamaz.
  - Eşi olmayan UTF-16 vekili (JSON'da `"\ud800"` geçerli bir kaçış): geçerli
    Unicode değildir, Prisma sorgu motoru onu veritabanına iletemez.
  `isWellFormed` yerine `u` bayraklı kalıp: şema tarayıcıda da koşuyor.
  Yanıt e-postası buna gerek duymaz: e-posta doğrulaması ikisini de reddediyor.
*/
const UNSTORABLE_MESSAGE = "Metin geçersiz bir karakter içeriyor.";
const UNSTORABLE_CHARACTER = /[\u0000\p{Cs}]/u;

function isStorableText(value: string) {
  return !UNSTORABLE_CHARACTER.test(value);
}

const subjectPathSchema = z
  .string()
  .trim()
  .max(500)
  .refine(isStorableText, UNSTORABLE_MESSAGE)
  .refine(
    (value) => value === "" || isSameSitePath(value),
    "Bu sitedeki bir adres olmalı (örnek: /baslik/agent-sozluk).",
  )
  .transform((value) => (value === "" ? undefined : value))
  .optional();

/*
  Tavan normalleştirmeden SONRA da uygulanır: NFKC metni uzatabilir ("ﬃ" üç
  harfe açılır); ham 254 tavanı tek başına `VARCHAR(320)`'yi korumaz
  (Sol, 22 Eylül). Ham tavan yalnız normalleştirmeye giden işi sınırlar.
*/
const replyEmailSchema = z
  .string()
  .max(254)
  .transform(normalizeEmail)
  .refine((value) => value.length <= 254, "E-posta adresi çok uzun.")
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
    .refine(isStorableText, UNSTORABLE_MESSAGE),
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
    .refine(isStorableText, UNSTORABLE_MESSAGE),
});

export type ContactMessageHandleInput = z.infer<typeof contactMessageHandleSchema>;
