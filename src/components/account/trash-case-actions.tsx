"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest, ClientApiError } from "@/lib/http/client";

export function TrashCaseActions({
  entryId,
  currentBody,
  hasOpenRevival,
  latestRevivalRejected,
  hasAppeal,
}: {
  entryId: string;
  currentBody: string;
  hasOpenRevival: boolean;
  latestRevivalRejected: boolean;
  hasAppeal: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState(currentBody);
  const [correction, setCorrection] = useState("");
  const [defense, setDefense] = useState("");
  const [pending, setPending] = useState<"revival" | "appeal">();
  const [error, setError] = useState<string>();

  const submitRevival = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending("revival");
    setError(undefined);
    try {
      await apiRequest(`/api/v1/entries/${entryId}/revival-requests`, {
        method: "POST",
        body: { body },
        csrf: true,
        idempotency: true,
      });
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof ClientApiError
          ? submitError.message
          : "Canlandırma isteği oluşturulamadı.",
      );
    } finally {
      setPending(undefined);
    }
  };

  const submitAppeal = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending("appeal");
    setError(undefined);
    try {
      await apiRequest(`/api/v1/entries/${entryId}/appeals`, {
        method: "POST",
        body: { correction, defense },
        csrf: true,
        idempotency: true,
      });
      setCorrection("");
      setDefense("");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof ClientApiError ? submitError.message : "İtiraz oluşturulamadı.",
      );
    } finally {
      setPending(undefined);
    }
  };

  if (hasAppeal)
    return <p className="mt-4 text-sm font-semibold text-muted">İtiraz inceleme sırasında.</p>;
  if (hasOpenRevival)
    return (
      <p className="mt-4 text-sm font-semibold text-muted">
        Canlandırma isteği inceleme sırasında.
      </p>
    );

  return (
    <div className="mt-5 space-y-6 border-t pt-5">
      <form onSubmit={submitRevival} className="space-y-3">
        <div>
          <label htmlFor={`trash-body-${entryId}`} className="mb-2 block text-sm font-bold">
            Düzeltilmiş entry
          </label>
          <textarea
            id={`trash-body-${entryId}`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            minLength={10}
            maxLength={10_000}
            required
            className="min-h-36 w-full rounded-xl border bg-page p-3 leading-7"
          />
          <p className="mt-2 text-xs text-muted">
            Entry’de somut bir düzeltme yapın. Moderasyon tartışmasını entry’ye eklemeyin.
          </p>
        </div>
        <button
          type="submit"
          disabled={pending !== undefined || body.trim() === currentBody.trim()}
          className="button-primary"
        >
          {pending === "revival" ? "Gönderiliyor…" : "Düzelt ve canlandırma iste"}
        </button>
      </form>

      {latestRevivalRejected ? (
        <form onSubmit={submitAppeal} className="space-y-3 rounded-xl border p-4">
          <h3 className="font-black">Somut itiraz</h3>
          <p className="text-sm text-muted">
            Entry, başlık ve exact moderasyon gerekçesi vakadan otomatik bağlanır.
          </p>
          <div>
            <label
              htmlFor={`appeal-correction-${entryId}`}
              className="mb-2 block text-sm font-bold"
            >
              Yaptığınız düzeltme
            </label>
            <textarea
              id={`appeal-correction-${entryId}`}
              value={correction}
              onChange={(event) => setCorrection(event.target.value)}
              minLength={10}
              maxLength={1000}
              required
              className="min-h-24 w-full rounded-xl border bg-page p-3"
            />
          </div>
          <div>
            <label htmlFor={`appeal-defense-${entryId}`} className="mb-2 block text-sm font-bold">
              Somut savunmanız
            </label>
            <textarea
              id={`appeal-defense-${entryId}`}
              value={defense}
              onChange={(event) => setDefense(event.target.value)}
              minLength={20}
              maxLength={2000}
              required
              className="min-h-28 w-full rounded-xl border bg-page p-3"
            />
          </div>
          <button
            type="submit"
            disabled={
              pending !== undefined || correction.trim().length < 10 || defense.trim().length < 20
            }
            className="button-secondary"
          >
            {pending === "appeal" ? "Gönderiliyor…" : "İtirazı gönder"}
          </button>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
