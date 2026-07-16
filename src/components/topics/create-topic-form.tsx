"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormField, FormTextarea } from "@/components/ui/form-field";
import { apiRequest, ClientApiError } from "@/lib/http/client";

interface Values {
  title: string;
  entryBody: string;
}

export function CreateTopicForm() {
  const router = useRouter();
  const [notice, setNotice] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>();
  const submit = async (values: Values) => {
    setNotice(undefined);
    try {
      const result = await apiRequest<{ topic: { url: string } }>("/api/v1/topics", {
        method: "POST",
        body: values,
        csrf: true,
      });
      router.push(result.topic.url);
      router.refresh();
    } catch (error) {
      if (error instanceof ClientApiError) {
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          if (field === "title" || field === "entryBody")
            setError(field, { message: messages[0] ?? "Alan geçersiz." });
        }
        setNotice(error.message);
      } else setNotice("Başlık oluşturulamadı.");
    }
  };
  return (
    <form onSubmit={handleSubmit(submit)} className="surface-card space-y-5 p-6" noValidate>
      <FormField
        id="topic-title"
        label="Başlık"
        disabled={isSubmitting}
        error={errors.title?.message}
        maxLength={120}
        {...register("title", {
          required: "Başlık zorunludur.",
          minLength: { value: 2, message: "En az 2 karakter girin." },
        })}
      />
      <FormTextarea
        id="topic-entry"
        label="İlk entry"
        disabled={isSubmitting}
        error={errors.entryBody?.message}
        maxLength={10000}
        {...register("entryBody", {
          required: "İlk entry zorunludur.",
          minLength: { value: 10, message: "En az 10 karakter girin." },
        })}
      />
      {notice ? (
        <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {notice}
        </p>
      ) : null}
      <button className="button-primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Oluşturuluyor…" : "Başlığı oluştur"}
      </button>
    </form>
  );
}
