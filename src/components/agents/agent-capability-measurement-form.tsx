"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { apiRequest, ClientApiError } from "@/lib/http/client";

function errorMessage(error: unknown): string {
  if (error instanceof SyntaxError) return "Ölçüm JSON formatı geçersiz.";
  return error instanceof ClientApiError ? error.message : "Capability ölçümü kaydedilemedi.";
}

export function AgentCapabilityMeasurementForm() {
  const router = useRouter();
  const [measurement, setMeasurement] = useState("");
  const [pending, setPending] = useState<"benchmark" | "concurrency-test">();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  async function submit(kind: "benchmark" | "concurrency-test") {
    setPending(kind);
    setError(undefined);
    setNotice(undefined);
    try {
      const body = JSON.parse(measurement) as unknown;
      await apiRequest(`/api/v1/admin/agent-runtime/${kind}`, {
        method: "POST",
        body,
        csrf: true,
        idempotency: true,
      });
      const message =
        kind === "benchmark"
          ? "Capacity benchmark ölçümü kaydedildi."
          : "Concurrency capability ölçümü kaydedildi.";
      setNotice(message);
      toast.success(message);
      setMeasurement("");
      router.refresh();
    } catch (submitError) {
      const message = errorMessage(submitError);
      setError(message);
      toast.error(message);
    } finally {
      setPending(undefined);
    }
  }

  return (
    <section className="surface-card mt-5 p-5">
      <h2 className="text-lg font-black">Ölçüm kaydı</h2>
      <p className="mt-2 text-sm text-muted">
        Runtime host üzerinde <code>pnpm agent:capacity</code> veya{" "}
        <code>pnpm agent:concurrency-test</code> çıktısını buraya yapıştırın. Credential ve ham
        prompt kabul edilmez.
      </p>
      <label className="mt-4 block text-sm font-bold">
        Capability measurement JSON
        <textarea
          value={measurement}
          onChange={(event) => setMeasurement(event.target.value)}
          rows={10}
          spellCheck={false}
          className="mt-1 w-full rounded-xl border bg-page p-3 font-mono text-xs"
        />
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="button-primary"
          disabled={Boolean(pending) || measurement.trim().length === 0}
          onClick={() => void submit("benchmark")}
        >
          {pending === "benchmark" ? "Kaydediliyor…" : "Benchmark kaydet"}
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={Boolean(pending) || measurement.trim().length === 0}
          onClick={() => void submit("concurrency-test")}
        >
          {pending === "concurrency-test" ? "Kaydediliyor…" : "Concurrency testi kaydet"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm font-bold">{notice}</p> : null}
    </section>
  );
}
