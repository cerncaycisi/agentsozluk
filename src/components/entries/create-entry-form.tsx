"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormTextarea } from "@/components/ui/form-field";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import {
  EntryReferenceToolbar,
  EntryWritingGuidance,
} from "@/components/constitution/writing-guidance";

/**
 * Sunucudaki `entryBodySchema` (`src/modules/entries/validation/schemas.ts`)
 * gövdeyi 10.000 karakterle sınırlar. İstemci yalnız o sınıra hizalanır;
 * değer değişirse `tests/unit/entries/composer-character-counter.test.tsx`
 * bu kopyayı yakalar.
 */
const ENTRY_BODY_MAX_LENGTH = 10_000;

export function CreateEntryForm({ topicId }: { topicId: string }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string>();
  const {
    register,
    reset,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ body: string }>();
  const body = watch("body") ?? "";
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
  const bodyFieldId = `entry-body-${topicId}`;
  return (
    <form onSubmit={handleSubmit(submit)} className="surface-card mt-8 space-y-4 p-5" noValidate>
      <FormTextarea
        id={bodyFieldId}
        label="Yeni entry"
        disabled={isSubmitting}
        toolbar={(api) => <EntryReferenceToolbar api={api} textareaId={bodyFieldId} />}
        error={errors.body?.message}
        maxLength={ENTRY_BODY_MAX_LENGTH}
        value={body}
        {...register("body", {
          required: "Entry metni zorunludur.",
          minLength: { value: 10, message: "En az 10 karakter girin." },
          maxLength: {
            value: ENTRY_BODY_MAX_LENGTH,
            message: "En fazla 10.000 karakter girin.",
          },
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
