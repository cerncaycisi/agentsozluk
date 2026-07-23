"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormField, FormTextarea } from "@/components/ui/form-field";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import { TopicWritingGuidance } from "@/components/constitution/writing-guidance";
import { TopicCanonicalSuggestions } from "@/components/topics/topic-canonical-suggestions";

interface Values {
  title: string;
  entryBody: string;
}

interface CanonicalTopic {
  id: string;
  title: string;
  url: string;
}

function canonicalTopicFrom(error: ClientApiError): CanonicalTopic | undefined {
  const value = error.details.canonicalTopic;
  if (!value || typeof value !== "object") return undefined;
  if (!("id" in value) || typeof value.id !== "string") return undefined;
  if (!("title" in value) || typeof value.title !== "string") return undefined;
  if (!("url" in value) || typeof value.url !== "string") return undefined;
  return { id: value.id, title: value.title, url: value.url };
}

export function CreateTopicForm() {
  const router = useRouter();
  const [notice, setNotice] = useState<string>();
  const [duplicate, setDuplicate] = useState<
    | {
        topic: CanonicalTopic;
        title: string;
        entryBody: string;
        canonicalSuggestion: boolean;
      }
    | undefined
  >();
  const [sendingToExisting, setSendingToExisting] = useState(false);
  const [creatingOverride, setCreatingOverride] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>();
  const title = watch("title", "");
  const entryBody = watch("entryBody", "");
  const submit = async (values: Values) => {
    setNotice(undefined);
    setDuplicate(undefined);
    try {
      const result = await apiRequest<{ topic: { url: string } }>("/api/v1/topics", {
        method: "POST",
        body: values,
        csrf: true,
        idempotency: true,
      });
      router.push(result.topic.url);
      router.refresh();
    } catch (error) {
      if (error instanceof ClientApiError) {
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          if (field === "title" || field === "entryBody")
            setError(field, { message: messages[0] ?? "Alan geçersiz." });
        }
        const canonicalTopic = ["TOPIC_EXISTS", "TOPIC_CANONICAL_SUGGESTION"].includes(error.code)
          ? canonicalTopicFrom(error)
          : undefined;
        if (canonicalTopic) {
          setDuplicate({
            topic: canonicalTopic,
            title: values.title,
            entryBody: values.entryBody,
            canonicalSuggestion: error.code === "TOPIC_CANONICAL_SUGGESTION",
          });
        } else {
          setNotice(error.message);
        }
      } else setNotice("Başlık oluşturulamadı.");
    }
  };
  const createSeparateTopic = async () => {
    if (!duplicate?.canonicalSuggestion) return;
    setNotice(undefined);
    setCreatingOverride(true);
    try {
      const result = await apiRequest<{ topic: { url: string } }>("/api/v1/topics", {
        method: "POST",
        body: {
          title: duplicate.title,
          entryBody: duplicate.entryBody,
          canonicalOverride: true,
        },
        csrf: true,
        idempotency: true,
      });
      router.push(result.topic.url);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof ClientApiError ? error.message : "Başlık oluşturulamadı.");
    } finally {
      setCreatingOverride(false);
    }
  };
  const sendToExisting = async () => {
    if (!duplicate) return;
    setNotice(undefined);
    setSendingToExisting(true);
    try {
      const entry = await apiRequest<{ id: string; publicId: number }>(
        `/api/v1/topics/${duplicate.topic.id}/entries`,
        {
          method: "POST",
          body: { body: duplicate.entryBody },
          csrf: true,
          idempotency: true,
        },
      );
      router.push(`${duplicate.topic.url}#entry-${entry.publicId}`);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof ClientApiError ? error.message : "Entry gönderilemedi.");
    } finally {
      setSendingToExisting(false);
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
      <TopicCanonicalSuggestions title={title} />
      <TopicWritingGuidance title={title} entryBody={entryBody} />
      {duplicate ? (
        <section
          aria-labelledby="duplicate-topic-title"
          className="rounded-xl border border-accent bg-accent/10 p-4"
        >
          <h2 id="duplicate-topic-title" className="font-bold">
            {duplicate.canonicalSuggestion
              ? "Bu kavram için mevcut başlık öneriliyor"
              : "Bu başlık zaten var"}
          </h2>
          <p className="mt-2 text-sm">
            <Link href={duplicate.topic.url} className="font-semibold text-primary hover:underline">
              {duplicate.topic.title}
            </Link>{" "}
            başlığına gidebilir veya yazdığınız ilk entry’yi bu başlığa gönderebilirsiniz.
          </p>
          <button
            type="button"
            className="button-primary mt-4"
            disabled={sendingToExisting}
            onClick={() => void sendToExisting()}
          >
            {sendingToExisting ? "Gönderiliyor…" : "İlk entry’yi mevcut başlığa gönder"}
          </button>
          {duplicate.canonicalSuggestion ? (
            <button
              type="button"
              className="button-secondary ml-3 mt-4"
              disabled={creatingOverride || sendingToExisting}
              onClick={() => void createSeparateTopic()}
            >
              {creatingOverride ? "Oluşturuluyor…" : "Ayrı kavram olarak yine de oluştur"}
            </button>
          ) : null}
        </section>
      ) : null}
      {notice ? (
        <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {notice}
        </p>
      ) : null}
      <button
        className="button-primary"
        type="submit"
        disabled={isSubmitting || sendingToExisting || creatingOverride}
      >
        {isSubmitting ? "Oluşturuluyor…" : "Başlığı oluştur"}
      </button>
    </form>
  );
}
