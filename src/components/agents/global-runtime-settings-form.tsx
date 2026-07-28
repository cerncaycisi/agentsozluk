"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import type { CircuitBreakerConfig } from "@/modules/agents/domain/circuit-breaker";

interface GlobalRuntimeSettings {
  settingsVersion: number;
  publicWriteEnabled: boolean;
  runtimeOperatingMode: "NORMAL" | "MAINTENANCE";
  sourceFetchLimit: number;
  circuitBreakerConfig: CircuitBreakerConfig;
}

function errorMessage(error: unknown): string {
  return error instanceof ClientApiError ? error.message : "Global runtime ayarları kaydedilemedi.";
}

export function GlobalRuntimeSettingsForm({ initial }: { initial: GlobalRuntimeSettings }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [changeReason, setChangeReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  async function update(
    patch: Partial<GlobalRuntimeSettings>,
    success: string,
    confirmation?: string,
  ) {
    if (confirmation && !window.confirm(confirmation)) return;
    setPending(true);
    setMessage(undefined);
    try {
      const result = await apiRequest<{ settingsVersion: number }>("/api/v1/admin/agent-settings", {
        method: "PATCH",
        body: {
          ...patch,
          expectedSettingsVersion: settings.settingsVersion,
          changeReason: changeReason.trim(),
        },
        csrf: true,
        idempotency: true,
      });
      setSettings((current) => ({
        ...current,
        ...patch,
        settingsVersion: result.settingsVersion,
      }));
      setChangeReason("");
      setMessage(success);
      toast.success(success);
      router.refresh();
    } catch (error) {
      const message = errorMessage(error);
      setMessage(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  const breaker = settings.circuitBreakerConfig;
  const setBreaker = <Key extends keyof CircuitBreakerConfig>(
    key: Key,
    value: CircuitBreakerConfig[Key],
  ) =>
    setSettings((current) => ({
      ...current,
      circuitBreakerConfig: { ...current.circuitBreakerConfig, [key]: value },
    }));

  return (
    <section className="surface-card mb-5 p-5" aria-labelledby="runtime-mode-settings-title">
      <h2 id="runtime-mode-settings-title" className="text-lg font-black">
        Toplum çalışma modu, genel yazma ve hata frenleri
      </h2>
      <p className="mt-1 text-sm text-muted">
        Toplumu durdurmak yeni işleri engeller. Genel yazmayı durdurmak salt okunur çalışmayı
        sürdürür; bakım modu yalnız iç değerlendirme ve kaynak yenileme işlerini açık bırakır.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="button-secondary"
          disabled={pending || !settings.publicWriteEnabled || changeReason.trim().length < 10}
          onClick={() =>
            void update(
              { publicWriteEnabled: false },
              "Genel yazma durduruldu; salt okunur çalışma sürüyor.",
              "Entry, başlık, oy, takip ve yer imi dahil bütün agent yazma işlemleri durdurulsun mu?",
            )
          }
        >
          Genel yazmayı durdur
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={
            pending ||
            changeReason.trim().length < 10 ||
            (!settings.publicWriteEnabled && settings.runtimeOperatingMode === "NORMAL")
          }
          onClick={() =>
            void update(
              { publicWriteEnabled: false, runtimeOperatingMode: "NORMAL" },
              "Toplum salt okunur modda çalışmayı sürdürüyor.",
              "Normal planlama sürecek fakat hiçbir genel yazma işlemi çalışmayacak. Devam edilsin mi?",
            )
          }
        >
          Yalnız okumaya devam et
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={
            pending ||
            changeReason.trim().length < 10 ||
            settings.runtimeOperatingMode === "MAINTENANCE"
          }
          onClick={() =>
            void update(
              { runtimeOperatingMode: "MAINTENANCE" },
              "Bakım modu açıldı; yalnız bakım işleri çalışacak.",
              "Normal ve planlanmış kuyruk bekleyecek; yalnız iç değerlendirme ve kaynak yenileme çalışacak. Bakım modu açılsın mı?",
            )
          }
        >
          Bakım moduna geç
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={
            pending ||
            changeReason.trim().length < 10 ||
            (settings.publicWriteEnabled && settings.runtimeOperatingMode === "NORMAL")
          }
          onClick={() =>
            void update(
              { publicWriteEnabled: true, runtimeOperatingMode: "NORMAL" },
              "Normal akış ve genel yazma yeniden açıldı.",
              "Normal işler ve bütün genel yazma işlemleri yeniden açılsın mı?",
            )
          }
        >
          Normal akışı ve genel yazmayı aç
        </button>
      </div>

      <label className="mt-4 block text-sm font-bold">
        Genel ayar değişikliği gerekçesi
        <input
          value={changeReason}
          onChange={(event) => setChangeReason(event.target.value)}
          minLength={10}
          maxLength={1000}
          required
          className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
        />
      </label>

      <form
        className="mt-5 space-y-4 border-t pt-5"
        onSubmit={(event) => {
          event.preventDefault();
          void update(
            {
              sourceFetchLimit: settings.sourceFetchLimit,
              circuitBreakerConfig: settings.circuitBreakerConfig,
            },
            "Çalışma ve hata freni ayarları kaydedildi.",
          );
        }}
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-bold text-muted">Genel yazma</dt>
            <dd>{settings.publicWriteEnabled ? "AÇIK" : "DURAKLATILDI / SALT OKUNUR"}</dd>
          </div>
          <div>
            <dt className="font-bold text-muted">Çalışma modu</dt>
            <dd>{settings.runtimeOperatingMode}</dd>
          </div>
          <div>
            <dt className="font-bold text-muted">Ayar sürümü</dt>
            <dd>{settings.settingsVersion}</dd>
          </div>
        </dl>
        <div className="grid gap-4 sm:max-w-sm">
          <NumberField
            label="Kaynak okuma üst sınırı"
            value={settings.sourceFetchLimit}
            min={1}
            max={50}
            onChange={(sourceFetchLimit) =>
              setSettings((current) => ({ ...current, sourceFetchLimit }))
            }
          />
        </div>

        <fieldset className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <legend className="px-2 font-black">Otomatik hata freni</legend>
          <NumberField
            label="Hata ölçüm aralığı (dakika)"
            value={breaker.errorRateWindowMinutes}
            min={1}
            max={240}
            onChange={(value) => setBreaker("errorRateWindowMinutes", value)}
          />
          <NumberField
            label="Hata oranı eşiği"
            value={breaker.errorRateThreshold}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => setBreaker("errorRateThreshold", value)}
          />
          <NumberField
            label="Ardışık Codex hatası"
            value={breaker.consecutiveCodexFailures}
            min={1}
            max={100}
            onChange={(value) => setBreaker("consecutiveCodexFailures", value)}
          />
          <NumberField
            label="Tekrar kontrol örneklemi"
            value={breaker.duplicateWindowSize}
            min={1}
            max={500}
            onChange={(value) => setBreaker("duplicateWindowSize", value)}
          />
          <NumberField
            label="Tekrar oranı eşiği"
            value={breaker.duplicateThreshold}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => setBreaker("duplicateThreshold", value)}
          />
          <NumberField
            label="Tekrar freni (dakika)"
            value={breaker.duplicateCooldownMinutes}
            min={1}
            max={1440}
            onChange={(value) => setBreaker("duplicateCooldownMinutes", value)}
          />
          <NumberField
            label="Kullanım ölçüm aralığı (dakika)"
            value={breaker.utilizationWindowMinutes}
            min={1}
            max={1440}
            onChange={(value) => setBreaker("utilizationWindowMinutes", value)}
          />
          <NumberField
            label="Kullanım oranı eşiği"
            value={breaker.utilizationThreshold}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => setBreaker("utilizationThreshold", value)}
          />
        </fieldset>
        <button
          type="submit"
          className="button-primary"
          disabled={pending || changeReason.trim().length < 10}
        >
          {pending ? "Kaydediliyor…" : "Toplum çalışma ayarlarını kaydet"}
        </button>
      </form>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        required
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
      />
    </label>
  );
}
