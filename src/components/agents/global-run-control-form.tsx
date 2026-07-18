"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { apiRequest, ClientApiError } from "@/lib/http/client";

type GlobalRunCommand = "cancel-pending" | "graceful-stop";

const commands = {
  "cancel-pending": {
    confirmation: "CANCEL_ALL_PENDING_WRITE_RUNS",
    prompt:
      "Bütün agent’ların QUEUED durumdaki write-capable run’ları iptal edilecek. Devam edilsin mi?",
    success: "Pending write run iptali tamamlandı.",
  },
  "graceful-stop": {
    confirmation: "GRACEFULLY_STOP_ALL_ACTIVE_RUNS",
    prompt:
      "Bütün agent’ların RUNNING durumdaki run’larına graceful stop isteği gönderilecek. Devam edilsin mi?",
    success: "Active run graceful-stop isteği tamamlandı.",
  },
} as const;

function errorMessage(error: unknown): string {
  return error instanceof ClientApiError ? error.message : "Global run kontrolü tamamlanamadı.";
}

export function GlobalRunControlForm() {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<GlobalRunCommand>();
  const [message, setMessage] = useState<string>();

  async function execute(command: GlobalRunCommand) {
    const descriptor = commands[command];
    if (!window.confirm(descriptor.prompt)) return;
    setPending(command);
    setMessage(undefined);
    try {
      const result = await apiRequest<{ count: number }>(`/api/v1/admin/agent-runs/${command}`, {
        method: "POST",
        body: { reason: reason.trim(), confirmation: descriptor.confirmation },
        csrf: true,
        idempotency: true,
      });
      setReason("");
      const success = `${descriptor.success} Etkilenen run: ${result.count}.`;
      setMessage(success);
      toast.success(success);
      router.refresh();
    } catch (error) {
      const message = errorMessage(error);
      setMessage(message);
      toast.error(message);
    } finally {
      setPending(undefined);
    }
  }

  return (
    <section className="mt-5 border-t pt-5" aria-labelledby="global-run-controls-title">
      <h3 id="global-run-controls-title" className="font-black">
        Global queue ve active-run kontrolleri
      </h3>
      <p className="mt-1 text-sm text-muted">
        Pending iptal yalnız write-capable queued işleri etkiler; graceful stop çalışan run’ın
        mevcut atomik adımını tamamlamasına izin verir.
      </p>
      <label className="mt-3 block text-sm font-bold">
        Global run kontrolü gerekçesi
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={10}
          maxLength={1000}
          className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="button-secondary"
          disabled={Boolean(pending) || reason.trim().length < 10}
          onClick={() => void execute("cancel-pending")}
        >
          {pending === "cancel-pending" ? "İptal ediliyor…" : "Tüm pending write run’ları iptal et"}
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={Boolean(pending) || reason.trim().length < 10}
          onClick={() => void execute("graceful-stop")}
        >
          {pending === "graceful-stop" ? "Stop isteniyor…" : "Tüm active run’lara graceful stop"}
        </button>
      </div>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </section>
  );
}
