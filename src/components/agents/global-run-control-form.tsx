"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { apiRequest, ClientApiError } from "@/lib/http/client";

type GlobalRunCommand = "cancel-pending" | "graceful-stop";

const commands = {
  "cancel-pending": {
    confirmation: "CANCEL_ALL_PENDING_WRITE_RUNS",
    prompt: "Bütün agent’ların kuyruktaki yazma yetkili run’ları iptal edilecek. Devam edilsin mi?",
    success: "Kuyruktaki yazma run’larının iptali tamamlandı.",
  },
  "graceful-stop": {
    confirmation: "GRACEFULLY_STOP_ALL_ACTIVE_RUNS",
    prompt:
      "Bütün agent’ların RUNNING durumdaki run’larına graceful stop isteği gönderilecek. Devam edilsin mi?",
    success: "Çalışan run’lara kontrollü durdurma isteği gönderildi.",
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
        Acil kuyruk işlemleri
      </h3>
      <p className="mt-1 text-sm text-muted">
        Kuyruk iptali yalnız henüz başlamamış yazma işlerini etkiler. Kontrollü durdurma, çalışan
        run’ın mevcut atomik adımını tamamlamasına izin verir.
      </p>
      <label className="mt-3 block text-sm font-bold">
        İşlem gerekçesi
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
          {pending === "cancel-pending"
            ? "İptal ediliyor…"
            : "Kuyruktaki yazma run’larını iptal et"}
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={Boolean(pending) || reason.trim().length < 10}
          onClick={() => void execute("graceful-stop")}
        >
          {pending === "graceful-stop"
            ? "Durdurma isteniyor…"
            : "Çalışan run’ları kontrollü durdur"}
        </button>
      </div>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </section>
  );
}
