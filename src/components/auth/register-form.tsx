"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormField } from "@/components/ui/form-field";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import { registrationSchema, type RegistrationInput } from "@/modules/auth/validation/schemas";

export function RegisterForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const [registeredPending, setRegisteredPending] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationInput>({ resolver: zodResolver(registrationSchema) });

  const submit = async (input: RegistrationInput) => {
    setFormError(undefined);
    try {
      await apiRequest("/api/v1/auth/register", { method: "POST", body: input });
      setRegisteredPending(true);
      router.refresh();
    } catch (error) {
      if (error instanceof ClientApiError) {
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          if (field in input && messages[0])
            setError(field as keyof RegistrationInput, { message: messages[0] });
        }
        setFormError(error.message);
      } else setFormError("Kayıt tamamlanamadı.");
    }
  };

  if (registeredPending)
    return (
      <div className="space-y-4 rounded-xl border bg-surface p-5" role="status">
        <h2 className="text-xl font-black">Kaydın alındı</h2>
        <p className="leading-7 text-muted">
          Yazar hesabın admin onayına gönderildi. Onay verilene kadar başlık açamaz ve entry
          yazamazsın; siteyi gezmeye devam edebilirsin.
        </p>
        <button type="button" className="button-primary" onClick={() => router.push("/rastgele")}>
          Rastgele bir başlığa git
        </button>
      </div>
    );

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
      <FormField
        id="register-email"
        type="email"
        autoComplete="email"
        label="E-posta"
        disabled={isSubmitting}
        error={errors.email?.message}
        {...register("email")}
      />
      <FormField
        id="register-username"
        autoComplete="username"
        label="Kullanıcı adı"
        hint="3–30 karakter; küçük harf, rakam ve alt çizgi. Daha sonra değiştirilemez."
        disabled={isSubmitting}
        error={errors.username?.message}
        {...register("username")}
      />
      <FormField
        id="register-display-name"
        autoComplete="name"
        label="Görünen ad"
        disabled={isSubmitting}
        error={errors.displayName?.message}
        {...register("displayName")}
      />
      <FormField
        id="register-password"
        type="password"
        autoComplete="new-password"
        label="Şifre"
        hint="En az 10 karakter, bir harf ve bir rakam."
        disabled={isSubmitting}
        error={errors.password?.message}
        {...register("password")}
      />
      <FormField
        id="register-password-confirmation"
        type="password"
        autoComplete="new-password"
        label="Şifre tekrarı"
        disabled={isSubmitting}
        error={errors.passwordConfirmation?.message}
        {...register("passwordConfirmation")}
      />
      <div>
        <label className="flex items-start gap-3 text-sm leading-6">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            disabled={isSubmitting}
            {...register("termsAccepted")}
          />
          <span>Topluluk kurallarını ve üyelik koşullarını okudum, kabul ediyorum.</span>
        </label>
        {errors.termsAccepted?.message ? (
          <p className="mt-1.5 text-sm text-destructive">{errors.termsAccepted.message}</p>
        ) : null}
      </div>
      {formError ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {formError}
        </p>
      ) : null}
      <button type="submit" disabled={isSubmitting} className="button-primary w-full">
        {isSubmitting ? "Hesap oluşturuluyor…" : "Hesap oluştur"}
      </button>
    </form>
  );
}
