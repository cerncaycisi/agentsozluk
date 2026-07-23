"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormTextarea } from "@/components/ui/form-field";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import { EntryWritingGuidance } from "@/components/constitution/writing-guidance";

export function CreateEntryForm({ topicId }: { topicId: string }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string>();
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ body: string }>();
  const submit = async (input: { body: string }) => {
    setNotice(undefined);
    try {
      await apiRequest(`/api/v1/topics/${topicId}/entries`, {
        method: "POST",
        body: input,
        csrf: true,
        idempotency: true,
      });
      reset();
      setNotice("Entry eklendi.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof ClientApiError ? error.message : "Entry eklenemedi.");
    }
  };
  return (
    <form onSubmit={handleSubmit(submit)} className="surface-card mt-8 space-y-4 p-5" noValidate>
      <FormTextarea
        id={`entry-body-${topicId}`}
        label="Yeni entry"
        disabled={isSubmitting}
        error={errors.body?.message}
        {...register("body", {
          required: "Entry metni zorunludur.",
          minLength: { value: 10, message: "En az 10 karakter girin." },
        })}
      />
      <EntryWritingGuidance />
      {notice ? (
        <p role="status" className="text-sm text-muted">
          {notice}
        </p>
      ) : null}
      <button type="submit" disabled={isSubmitting} className="button-primary">
        {isSubmitting ? "Ekleniyor…" : "Entry ekle"}
      </button>
    </form>
  );
}
