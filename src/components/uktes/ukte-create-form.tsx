"use client";

import { useState, type FormEvent } from "react";
import { FormField } from "@/components/ui/form-field";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import { useAppRouter } from "@/lib/navigation/app-navigation";

export function UkteCreateForm({ fixedTitle }: { fixedTitle?: string } = {}) {
  const router = useAppRouter();
  const [title, setTitle] = useState(fixedTitle ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      const result = await apiRequest<{ id: string; created: boolean }>("/api/v1/uktes", {
        method: "POST",
        csrf: true,
        idempotency: true,
        body: { title: fixedTitle ?? title },
      });
      setNotice(result.created ? "Ukte bırakıldı." : "Bu başlık için zaten bir ukte var.");
      if (!fixedTitle) setTitle("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ClientApiError ? cause.message : "Ukte bırakılamadı.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="surface-card space-y-4 p-5">
      {fixedTitle ? (
        <p className="text-muted">Onaylı yazar hesabınızla bu başlığa ukte de bırakabilirsiniz.</p>
      ) : (
        <FormField
          id="ukte-title"
          label="Hangi başlıkta yazı okumak istersiniz?"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={100}
          required
          disabled={busy}
        />
      )}
      <button type="submit" className="button-secondary" disabled={busy}>
        {busy ? "Bırakılıyor…" : "Ukte bırak"}
      </button>
      {notice && (
        <p role="status" className="text-sm text-muted">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
