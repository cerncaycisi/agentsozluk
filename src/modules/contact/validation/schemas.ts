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

const subjectPathSchema = z
  .string()
  .trim()
  .max(500)
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
  message: z.string().trim().min(10, "En az 10 karakter yazın.").max(4000),
  replyEmail: replyEmailSchema,
});

export type ContactMessageCreateInput = z.infer<typeof contactMessageCreateSchema>;

/*
  Kapatma notu zorunlu: kullanıcıya "ne istendiği ve ne yapıldığı sonradan
  gösterilebilir" deniyor ve moderasyon arayüzü zaten en az 10 karakter
  istiyordu. Sunucunun daha gevşek olması o sözü delerdi (Sol, 22 Eylül).
*/
export const contactMessageHandleSchema = z.object({
  note: z.string().trim().min(10, "En az 10 karakter yazın.").max(1000),
});

export type ContactMessageHandleInput = z.infer<typeof contactMessageHandleSchema>;
