"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormField, FormTextarea } from "@/components/ui/form-field";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import {
  contactMessageCreateSchema,
  type ContactMessageCreateInput,
} from "@/modules/contact/validation/schemas";

/**
 * `authenticated` yalnız CSRF anahtarının istenip istenmeyeceğini belirler.
 * Anonim ziyaretçinin oturumu ve dolayısıyla CSRF anahtarı yok; uç nokta da
 * anonim gönderimi kabul ediyor.
 */
export function ContactForm({ authenticated }: { authenticated: boolean }) {
  const [formError, setFormError] = useState<string>();
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ContactMessageCreateInput>({
    resolver: zodResolver(contactMessageCreateSchema),
    defaultValues: { kind: "CONTENT_REMOVAL" },
  });

  const submit = async (input: ContactMessageCreateInput) => {
    setFormError(undefined);
    try {
      await apiRequest("/api/v1/iletisim", {
        method: "POST",
        body: input,
        ...(authenticated ? { csrf: true } : {}),
      });
      setSent(true);
    } catch (error) {
      if (error instanceof ClientApiError) {
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          if (field in input && messages[0])
            setError(field as keyof ContactMessageCreateInput, { message: messages[0] });
        }
        setFormError(error.message);
      } else setFormError("İleti gönderilemedi.");
    }
  };

  if (sent)
    return (
      <div className="space-y-3 rounded-lg border bg-surface p-6" role="status">
        <h2 className="title-section">İletiniz alındı</h2>
        <p className="leading-7 text-muted">
          Moderasyon kuyruğuna düştü. Yanıt adresi bıraktıysanız gerektiğinde oradan dönülecek.
        </p>
      </div>
    );

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="contact-kind" className="mb-2 block text-sm font-medium">
          Konu
        </label>
        <select
          id="contact-kind"
          disabled={isSubmitting}
          className="min-h-11 w-full rounded border field-border bg-page px-3"
          {...register("kind")}
        >
          <option value="CONTENT_REMOVAL">İçerik kaldırma / düzeltme talebi</option>
          <option value="OTHER">Diğer</option>
        </select>
      </div>
      <FormField
        id="contact-subject-path"
        label="İlgili sayfanın adresi (isteğe bağlı)"
        hint="Sitedeki yolu yazın: /baslik/agent-sozluk gibi."
        placeholder="/baslik/..."
        disabled={isSubmitting}
        error={errors.subjectPath?.message}
        {...register("subjectPath")}
      />
      <FormTextarea
        id="contact-message"
        label="İletiniz"
        hint="Neyin kaldırılmasını ya da düzeltilmesini istediğinizi ve gerekçenizi yazın."
        maxLength={4000}
        disabled={isSubmitting}
        error={errors.message?.message}
        {...register("message")}
      />
      <FormField
        id="contact-reply-email"
        type="email"
        autoComplete="email"
        label="Yanıt adresi (isteğe bağlı)"
        hint="Yalnız size dönmek için kullanılır; boş bırakabilirsiniz."
        disabled={isSubmitting}
        error={errors.replyEmail?.message}
        {...register("replyEmail")}
      />
      {formError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {formError}
        </p>
      ) : null}
      <button type="submit" disabled={isSubmitting} className="button-primary w-full">
        {isSubmitting ? "Gönderiliyor…" : "Gönder"}
      </button>
    </form>
  );
}
