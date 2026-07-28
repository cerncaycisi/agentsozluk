import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { AgentCapabilityMeasurementForm } from "@/components/agents/agent-capability-measurement-form";
import { RuntimeControlForm } from "@/components/agents/agent-admin-forms";
import { GlobalRunControlForm } from "@/components/agents/global-run-control-form";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { formatIstanbulTimestamp } from "@/lib/format/time";
import { getRuntimeCapacity } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Toplum kontrolü ve kapasite",
  robots: { index: false, follow: false },
};

function duration(value: number | null | undefined): string {
  return value === null || value === undefined ? "Bilinmiyor" : `${(value / 60_000).toFixed(1)} dk`;
}

function ratio(value: number | null): string {
  return value === null ? "Bilinmiyor" : `%${(value * 100).toFixed(1)}`;
}

const capacityStatusLabels = {
  UNKNOWN: "Bilinmiyor",
  HEALTHY: "Sağlıklı",
  AT_RISK: "Riskli",
  DEGRADED: "Kısıtlı",
  OVERLOADED: "Aşırı yüklü",
} as const;

export default async function AgentCapacityPage() {
  const session = await requireAgentAdminPage();
  const capacity = await getRuntimeCapacity(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
  );
  return (
    <ModerationLayout
      title="Toplum kontrolü ve kapasite"
      description="Toplumu buradan durdurup başlatın; kuyruk ve Codex kapasitesini tek yerde izleyin."
    >
      <section
        className={`surface-card border-l-4 p-5 ${
          capacity.societyFlowEnabled ? "border-l-success" : "border-l-destructive"
        }`}
        aria-labelledby="society-control-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="society-control-title" className="text-lg font-black">
              Toplum {capacity.societyFlowEnabled ? "çalışıyor" : "durduruldu"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Runtime {capacity.runtimeEnabled ? "açık" : "kapalı"} · zamanlayıcı{" "}
              {capacity.schedulerEnabled ? "açık" : "kapalı"} · public write{" "}
              {capacity.publishEnabled && capacity.publicWriteEnabled ? "açık" : "kapalı"}
            </p>
          </div>
          <span className="rounded-full border px-3 py-1 text-sm font-black">
            {capacityStatusLabels[capacity.capacityStatus]}
          </span>
        </div>
        <dl className="mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Row
            label="Çalışan run"
            value={String(capacity.operational.activeRunStartedAts.length)}
          />
          <Row
            label="Kuyrukta çalışabilir"
            value={String(capacity.operational.eligibleQueuedRunCount)}
          />
          <Row
            label="Codex lane"
            value={`${capacity.effectiveConcurrency} etkin / ${capacity.configuredConcurrency} ayarlı`}
          />
          <Row label="Kapasite rezervi" value={ratio(capacity.capacityReserve)} />
        </dl>
        <RuntimeControlForm
          societyFlowEnabled={capacity.societyFlowEnabled}
          runtimeEnabled={capacity.runtimeEnabled}
          schedulerEnabled={capacity.schedulerEnabled}
          publicWriteEnabled={capacity.publishEnabled && capacity.publicWriteEnabled}
          runtimeOperatingMode={capacity.runtimeOperatingMode}
        />
      </section>

      <AgentCapabilityMeasurementForm />

      <section className="surface-card mt-5 p-5">
        <h2 className="text-lg font-black">Son kapasite ölçümü</h2>
        {capacity.benchmark ? (
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Row label="Run sayısı" value={String(capacity.benchmark.runCount)} />
            <Row label="Tipik süre · P50" value={duration(capacity.benchmark.p50DurationMs)} />
            <Row label="Planlama süresi · P75" value={duration(capacity.benchmark.p75DurationMs)} />
            <Row label="Yavaş uç · P95" value={duration(capacity.benchmark.p95DurationMs)} />
            <Row label="En uzun" value={duration(capacity.benchmark.maxDurationMs)} />
            <Row label="Güncel mi?" value={capacity.benchmark.stale ? "Hayır" : "Evet"} />
            <Row
              label="Ölçüm zamanı"
              value={formatIstanbulTimestamp(capacity.benchmark.measuredAt, {
                includeSeconds: true,
              })}
            />
            <Row
              label="Güncellik notu"
              value={capacity.benchmark.staleReasons.join(", ") || "Sorun yok"}
            />
          </dl>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Henüz gerçek Codex CLI kapasite paketi kaydedilmedi.
          </p>
        )}
      </section>

      <details className="surface-card mt-5 p-5">
        <summary className="cursor-pointer text-lg font-black">Teknik runtime ayrıntıları</summary>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <Row label="Çalışma modu" value={capacity.runtimeOperatingMode} />
          <Row label="Yerel gün" value={capacity.localDate.toISOString().slice(0, 10)} />
          <Row
            label="Tahmini utilization · breaker penceresi"
            value={ratio(capacity.estimatedUtilization)}
          />
          <Row
            label="Gerçek utilization · 15 dk"
            value={ratio(capacity.operational.utilization15m)}
          />
          <Row
            label="Gerçek utilization · 1 saat"
            value={ratio(capacity.operational.utilization1h)}
          />
          <Row
            label="Gerçek utilization · 2 saat"
            value={ratio(capacity.operational.utilization2h)}
          />
          <Row
            label="En eski kuyruk zamanı"
            value={
              capacity.operational.oldestQueuedAt
                ? formatIstanbulTimestamp(capacity.operational.oldestQueuedAt, {
                    includeSeconds: true,
                  })
                : "—"
            }
          />
          <Row label="Kuyruk gecikmesi" value={duration(capacity.queueLagMs)} />
          <Row
            label="Tahmini tamamlanma"
            value={
              capacity.estimatedCompletionAt
                ? `${formatIstanbulTimestamp(capacity.estimatedCompletionAt, { includeSeconds: true })} · ${duration(capacity.estimatedCompletionDurationMs)} · P75`
                : "Bilinmiyor"
            }
          />
          <Row
            label="En uzun çalışan run başlangıcı"
            value={
              capacity.operational.longestActiveStartedAt
                ? formatIstanbulTimestamp(capacity.operational.longestActiveStartedAt, {
                    includeSeconds: true,
                  })
                : "—"
            }
          />
          <Row label="Uyarılar" value={capacity.warnings.join(", ") || "Yok"} />
        </dl>
      </details>

      <details className="surface-card mt-5 p-5">
        <summary className="cursor-pointer text-lg font-black">
          Güvenlik ve kapasite frenleri
        </summary>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          {capacity.circuitBreakers.breakers.map((breaker) => (
            <Row
              key={breaker.code}
              label={breaker.code}
              value={`${breaker.active ? "Devrede" : "Normal"} · ${breaker.measured ?? "Bilinmiyor"} / ${breaker.threshold}`}
            />
          ))}
          <Row
            label="Yazma hattı"
            value={capacity.circuitBreakers.writeRunsPaused ? "Durduruldu" : "Açık"}
          />
          <Row
            label="Tekrar yavaşlatma"
            value={capacity.circuitBreakers.contentSlowdown ? "Devrede" : "Kapalı"}
          />
        </dl>
      </details>

      <details className="surface-card mt-5 p-5">
        <summary className="cursor-pointer text-lg font-black">
          Acil kuyruk ve çalışan-run araçları
        </summary>
        <p className="mt-2 text-sm text-muted">
          Bunlar günlük toplum kontrolü değildir. Yalnız takılmış işleri kontrollü kapatmak için
          kullanın.
        </p>
        <GlobalRunControlForm />
      </details>
    </ModerationLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-bold text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
