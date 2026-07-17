import { z } from "zod";
import { normalizeDisplayName, normalizeEmail } from "@/modules/auth/domain/normalization";

const commonPasswords = new Set([
  "1234567890",
  "password123",
  "qwerty12345",
  "admin12345",
  "sifre12345",
  "turkiye123",
]);

export const emailSchema = z
  .string()
  .max(254)
  .transform(normalizeEmail)
  .pipe(z.string().email("Geçerli bir e-posta adresi girin."));

export const usernameSchema = z
  .string()
  .transform((value) => value.normalize("NFKC").trim().toLowerCase())
  .pipe(
    z
      .string()
      .regex(
        /^[a-z0-9_]{3,30}$/u,
        "Kullanıcı adı 3–30 karakter; küçük harf, rakam ve alt çizgi olabilir.",
      ),
  );

export const displayNameSchema = z
  .string()
  .transform(normalizeDisplayName)
  .pipe(z.string().min(2, "Görünen ad en az 2 karakter olmalıdır.").max(50));

export const passwordSchema = z
  .string()
  .min(10, "Şifre en az 10 karakter olmalıdır.")
  .max(128, "Şifre en fazla 128 karakter olabilir.")
  .refine((value) => /\p{L}/u.test(value), "Şifre en az bir harf içermelidir.")
  .refine((value) => /\d/u.test(value), "Şifre en az bir rakam içermelidir.")
  .refine(
    (value) => !commonPasswords.has(value.toLocaleLowerCase("tr-TR")),
    "Bu şifre çok yaygın; başka bir şifre seçin.",
  );

export const registrationSchema = z
  .object({
    email: emailSchema,
    username: usernameSchema,
    displayName: displayNameSchema,
    password: passwordSchema,
    passwordConfirmation: z.string(),
    termsAccepted: z.literal(true, { error: "Üyelik sözleşmesini kabul etmelisiniz." }),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Şifreler eşleşmiyor.",
  });

export const loginSchema = z.object({ email: emailSchema, password: z.string().max(128) });

export const profileUpdateSchema = z.object({
  displayName: displayNameSchema,
  bio: z
    .string()
    .transform((value) => value.normalize("NFKC").trim())
    .pipe(z.string().max(500))
    .nullable(),
});

export const emailChangeSchema = z.object({
  email: emailSchema,
  currentPassword: z.string().max(128),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().max(128),
    newPassword: passwordSchema,
    newPasswordConfirmation: z.string(),
  })
  .refine((value) => value.newPassword === value.newPasswordConfirmation, {
    path: ["newPasswordConfirmation"],
    message: "Yeni şifreler eşleşmiyor.",
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ["newPassword"],
    message: "Yeni şifre mevcut şifreyle aynı olamaz.",
  });

export const deactivationSchema = z.object({
  currentPassword: z.string().max(128),
  usernameConfirmation: z.string(),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type EmailChangeInput = z.infer<typeof emailChangeSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
export type DeactivationInput = z.infer<typeof deactivationSchema>;
