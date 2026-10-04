"use client";

import { useState, type FormEvent } from "react";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import { useAppRouter } from "@/lib/navigation/app-navigation";
import { FormField } from "@/components/ui/form-field";

export function UkteActions({
  id,
  version,
  status,
  canWithdraw,
  admin = false,
}: {
  id: string;
  version: number;
  status: string;
  canWithdraw: boolean;
  admin?: boolean;
}) {
  const router = useAppRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [reason, setReason] = useState("");
  async function act(kind: "withdraw" | "visibility") {
    setBusy(true);
    setError(undefined);
    try {
      await apiRequest(
        kind === "withdraw"
          ? `/api/v1/uktes/${id}/withdraw`
          : `/api/v1/admin/uktes/${id}/visibility`,
        {
          method: "POST",
          csrf: true,
          idempotency: true,
          body:
            kind === "withdraw"
              ? {}
              : { hidden: status === "OPEN", expectedVersion: version, reason },
        },
      );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ClientApiError ? cause.message : "İşlem tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }
  function moderate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void act("visibility");
  }
  return (
    <div className="mt-3 space-y-3">
      {canWithdraw && (
        <button
          type="button"
          className="button-secondary text-sm"
          disabled={busy}
          onClick={() => void act("withdraw")}
        >
          Uktemi geri çek
        </button>
      )}
      {admin && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Moderasyon</summary>
          <form onSubmit={moderate} className="mt-3 space-y-3">
            <FormField
              id={`ukte-reason-${id}`}
              label="Gerekçe"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={5}
              maxLength={500}
              required
              disabled={busy}
            />
            <button className="button-secondary" disabled={busy} type="submit">
              {status === "OPEN" ? "Ukteyi gizle" : "Ukteyi geri aç"}
            </button>
          </form>
        </details>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
