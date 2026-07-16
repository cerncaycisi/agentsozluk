"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest, ClientApiError } from "@/lib/http/client";

export function ConfirmAction({
  endpoint,
  label,
  title,
  description,
  fieldName = "reason",
  destructive = false,
}: {
  endpoint: string;
  label: string;
  title: string;
  description: string;
  fieldName?: "reason" | "resolutionNote";
  destructive?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      await apiRequest(endpoint, { method: "POST", body: { [fieldName]: reason }, csrf: true });
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof ClientApiError ? submitError.message : "İşlem tamamlanamadı.",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger asChild>
        <button
          type="button"
          className={
            destructive
              ? "inline-flex min-h-10 items-center rounded-lg border border-destructive px-3 py-2 text-sm font-bold text-destructive"
              : "button-secondary"
          }
        >
          {label}
        </button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[80] bg-black/60" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-surface p-6 shadow-2xl">
          <AlertDialog.Title className="text-xl font-black">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 leading-7 text-muted">
            {description}
          </AlertDialog.Description>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label htmlFor={`moderation-${endpoint}`} className="mb-2 block text-sm font-bold">
                Gerekçe
              </label>
              <textarea
                id={`moderation-${endpoint}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={10}
                maxLength={1000}
                required
                disabled={pending}
                aria-describedby={error ? `error-${endpoint}` : undefined}
                className="min-h-28 w-full rounded-xl border bg-page p-3"
              />
            </div>
            {error ? (
              <p id={`error-${endpoint}`} role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-3">
              <AlertDialog.Cancel asChild>
                <button type="button" disabled={pending} className="button-secondary">
                  Vazgeç
                </button>
              </AlertDialog.Cancel>
              <button
                type="submit"
                disabled={pending || reason.trim().length < 10}
                className={destructive ? "button-primary bg-destructive" : "button-primary"}
              >
                {pending ? "İşleniyor…" : "Onayla"}
              </button>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
