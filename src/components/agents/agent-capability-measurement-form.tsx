"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import {
  runtimeCapabilityPackageSchema,
  type RuntimeCapabilityPackageInput,
} from "@/modules/agents/validation/capacity-schemas";

type MeasurementKind = keyof RuntimeCapabilityPackageInput;

function errorMessage(error: unknown): string {
  if (error instanceof SyntaxError) return "Ölçüm dosyalarından biri geçerli JSON değil.";
  if (error instanceof ClientApiError) return error.message;
  return error instanceof Error ? error.message : "Kapasite paketi kaydedilemedi.";
}

function measurementKind(filename: string): MeasurementKind | undefined {
  const normalized = filename.toLocaleLowerCase("tr-TR");
  if (/(?:^|[-_.])cold(?:[-_.]|$)/u.test(normalized)) return "cold";
  if (/(?:^|[-_.])warm(?:[-_.]|$)/u.test(normalized)) return "warm";
  if (/(?:^|[-_.])dual(?:[-_.]|$)/u.test(normalized)) return "dual";
  return undefined;
}

function readMeasurementFile(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")), { once: true });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Dosya okunamadı.")), {
      once: true,
    });
    reader.readAsText(file);
  });
}

async function parseCapabilityFiles(files: File[]): Promise<RuntimeCapabilityPackageInput> {
  if (files.length === 1) {
    const document = JSON.parse(await readMeasurementFile(files[0]!)) as unknown;
    return runtimeCapabilityPackageSchema.parse(document);
  }
  if (files.length !== 3) {
    throw new Error("Tek paket JSON veya cold, warm ve dual olmak üzere tam üç dosya seçin.");
  }
  const packageDocument: Partial<Record<MeasurementKind, unknown>> = {};
  for (const file of files) {
    const kind = measurementKind(file.name);
    if (!kind) {
      throw new Error(
        "Üçlü seçimde dosya adları cold, warm ve dual türlerinden birini açıkça içermelidir.",
      );
    }
    if (packageDocument[kind]) {
      throw new Error(`${kind} ölçümü birden fazla kez seçildi.`);
    }
    packageDocument[kind] = JSON.parse(await readMeasurementFile(file)) as unknown;
  }
  return runtimeCapabilityPackageSchema.parse(packageDocument);
}

export function AgentCapabilityMeasurementForm() {
  const router = useRouter();
  const [measurementPackage, setMeasurementPackage] = useState<RuntimeCapabilityPackageInput>();
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  async function select(files: File[]) {
    setMeasurementPackage(undefined);
    setSelectedFiles(files.map(({ name }) => name));
    setError(undefined);
    setNotice(undefined);
    try {
      setMeasurementPackage(await parseCapabilityFiles(files));
    } catch (selectionError) {
      setError(errorMessage(selectionError));
    }
  }

  async function submit() {
    if (!measurementPackage) return;
    setPending(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await apiRequest<{
        dualConcurrencySupported: boolean;
        concurrencyDowngraded: boolean;
      }>("/api/v1/admin/agent-runtime/capability-package", {
        method: "POST",
        body: measurementPackage,
        csrf: true,
        idempotency: true,
      });
      const message = result.dualConcurrencySupported
        ? "Cold, warm ve dual ölçümleri birlikte kaydedildi; çift lane doğrulandı."
        : `Kapasite paketi kaydedildi; çift lane doğrulanmadı${
            result.concurrencyDowngraded ? " ve concurrency güvenli biçimde 1’e indirildi" : ""
          }.`;
      setNotice(message);
      toast.success(message);
      setMeasurementPackage(undefined);
      setSelectedFiles([]);
      router.refresh();
    } catch (submitError) {
      const message = errorMessage(submitError);
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="surface-card mt-5 p-5" aria-labelledby="capacity-package-title">
      <h2 id="capacity-package-title" className="title-section">
        Kapasite ölçüm paketi
      </h2>
      <p className="mt-2 text-sm text-muted">
        Tek işlemde cold, warm ve dual ölçümlerini doğrular ve kaydeder. Standart üç JSON dosyasını
        birlikte seçebilir veya <code>cold</code>, <code>warm</code> ve <code>dual</code> alanlarını
        içeren tek paket JSON yükleyebilirsiniz.
      </p>
      <label className="mt-4 block text-sm font-medium">
        Ölçüm dosyaları
        <input
          type="file"
          accept="application/json,.json"
          multiple
          onChange={(event) => void select(Array.from(event.target.files ?? []))}
          className="mt-1 block min-h-11 w-full rounded-xl border bg-page px-3 py-2"
        />
      </label>
      {selectedFiles.length > 0 ? (
        <p className="mt-2 text-xs text-muted">Seçilen: {selectedFiles.join(", ")}</p>
      ) : null}
      {measurementPackage ? (
        <div className="mt-4 rounded-xl border border-success/40 bg-success/10 p-4 text-sm">
          <p className="font-medium">Paket hazır — üç ölçümün fingerprint’i eşleşiyor.</p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <PreviewRow label="Codex" value={measurementPackage.dual.codexVersion} />
            <PreviewRow
              label="Prompt fingerprint"
              value={`${measurementPackage.dual.promptProfileHash.slice(0, 12)}…`}
            />
            <PreviewRow
              label="Cold run"
              value={String(measurementPackage.cold.benchmarkRunCount)}
            />
            <PreviewRow
              label="Warm run"
              value={String(measurementPackage.warm.benchmarkRunCount)}
            />
            <PreviewRow
              label="Dual run"
              value={String(measurementPackage.dual.dualRunSuccessCount)}
            />
            <PreviewRow label="Son durum" value={measurementPackage.dual.capacityStatus} />
          </dl>
          <button
            type="button"
            className="button-primary mt-4"
            disabled={pending}
            onClick={() => void submit()}
          >
            {pending ? "Üç ölçüm kaydediliyor…" : "Paketi doğrula ve birlikte kaydet"}
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? <p className="mt-3 text-sm font-medium">{notice}</p> : null}
    </section>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
