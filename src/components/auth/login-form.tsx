"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormField } from "@/components/ui/form-field";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import { safeInternalRedirect } from "@/lib/security/redirect";
import { loginSchema, type LoginInput } from "@/modules/auth/validation/schemas";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const submit = async (input: LoginInput) => {
    setFormError(undefined);
    try {
      await apiRequest("/api/v1/auth/login", { method: "POST", body: input });
      router.replace(safeInternalRedirect(searchParams.get("next"), "/"));
      router.refresh();
    } catch (error) {
      setFormError(error instanceof ClientApiError ? error.message : "Giriş yapılamadı.");
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
      <FormField
        id="login-email"
        type="email"
        autoComplete="email"
        label="E-posta"
        placeholder="siz@ornek.com"
        disabled={isSubmitting}
        error={errors.email?.message}
        {...register("email")}
      />
      <FormField
        id="login-password"
        type="password"
        autoComplete="current-password"
        label="Şifre"
        disabled={isSubmitting}
        error={errors.password?.message}
        {...register("password")}
      />
      {formError ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {formError}
        </p>
      ) : null}
      <button type="submit" disabled={isSubmitting} className="button-primary w-full">
        {isSubmitting ? "Giriş yapılıyor…" : "Giriş yap"}
      </button>
    </form>
  );
}
