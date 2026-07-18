"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiRequest, ClientApiError } from "@/lib/http/client";

type MemoryConfirmation =
  | "INVALIDATE_AGENT_MEMORY"
  | "FORGET_AGENT_MEMORY"
  | "RECONSOLIDATE_AGENT_MEMORY";

function commandError(error: unknown): string {
  return error instanceof ClientApiError ? error.message : "Hafıza işlemi tamamlanamadı.";
}

function MemoryCommandForm({
  endpoint,
  confirmation,
  title,
  description,
  buttonLabel,
  dangerous = false,
}: {
  endpoint: string;
  confirmation: MemoryConfirmation;
  title: string;
  description: string;
  buttonLabel: string;
  dangerous?: boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const confirmationId = useId();
  const descriptionId = useId();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  return (
    <form
      className="space-y-3 rounded-lg border p-3"
      aria-describedby={descriptionId}
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(undefined);
        setMessage(undefined);
        try {
          await apiRequest(endpoint, {
            method: "POST",
            body: { reason, confirmation },
            csrf: true,
            idempotency: true,
          });
          setReason("");
          setConfirmed(false);
          const message = "İşlem kaydedildi.";
          setMessage(message);
          toast.success(message);
          router.refresh();
        } catch (submitError) {
          const message = commandError(submitError);
          setError(message);
          toast.error(message);
        } finally {
          setPending(false);
        }
      }}
    >
      <div>
        <h3 className={`text-sm font-black ${dangerous ? "text-destructive" : ""}`}>{title}</h3>
        <p id={descriptionId} className="mt-1 text-xs text-muted">
          {description}
        </p>
      </div>
      <label htmlFor={inputId} className="block text-sm font-bold">
        Gerekçe
      </label>
      <textarea
        id={inputId}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        minLength={10}
        maxLength={1000}
        required
        className="min-h-20 w-full rounded-xl border bg-page p-3 text-sm"
      />
      <label htmlFor={confirmationId} className="flex items-start gap-2 text-sm font-bold">
        <input
          id={confirmationId}
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          required
          className="mt-1"
        />
        Bu işlemin geri alınabilir bir silme olmadığını ve kayıtların fiziksel olarak
        silinmeyeceğini onaylıyorum.
      </label>
      <button
        disabled={pending || !confirmed || reason.trim().length < 10}
        className={
          dangerous
            ? "inline-flex min-h-10 items-center rounded-lg border border-destructive px-3 py-2 text-sm font-bold text-destructive"
            : "button-secondary"
        }
      >
        {pending ? "İşleniyor…" : buttonLabel}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm font-bold text-success">
          {message}
        </p>
      ) : null}
    </form>
  );
}

export function MemoryInvalidateForm({ agentId, memoryId }: { agentId: string; memoryId: string }) {
  return (
    <MemoryCommandForm
      endpoint={`/api/v1/admin/agents/${agentId}/memories/${memoryId}/invalidate`}
      confirmation="INVALIDATE_AGENT_MEMORY"
      title="Tek kaydı geçersizleştir"
      description="Yalnız bu episode aktif runtime context'inden çıkarılır; türetilmiş kayıtlar değişmez."
      buttonLabel="Kaydı geçersizleştir"
    />
  );
}

export function MemoryForgetForm({ agentId, memoryId }: { agentId: string; memoryId: string }) {
  return (
    <MemoryCommandForm
      endpoint={`/api/v1/admin/agents/${agentId}/memories/${memoryId}/forget`}
      confirmation="FORGET_AGENT_MEMORY"
      title="Soy ağacıyla unut"
      description="Seçili kök ile evidence.sourceMemoryIds üzerinden türetilmiş bütün aktif consolidation torunları geçersizleştirilir."
      buttonLabel="Kökü ve torunları unut"
      dangerous
    />
  );
}

export function MemoryReconsolidateForm({ agentId }: { agentId: string }) {
  return (
    <MemoryCommandForm
      endpoint={`/api/v1/admin/agents/${agentId}/memories/reconsolidate`}
      confirmation="RECONSOLIDATE_AGENT_MEMORY"
      title="Hafızayı yeniden birleştir"
      description="Tek bir public-write kapalı REFLECTION çalışması ADMIN_MEMORY_RECONSOLIDATE tetikleyicisiyle kuyruğa alınır."
      buttonLabel="Reconsolidation kuyruğa al"
    />
  );
}
