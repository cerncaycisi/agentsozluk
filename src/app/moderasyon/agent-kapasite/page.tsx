import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
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
  if (value === null || value === undefined) return "Bilinmiyor";
  if (value < 60_000) return `${Math.round(value / 1000)} sn`;
  return `${(value / 60_000).toFixed(1)} dk`;
}

function ratio(value: number | null): string {
  return value === null ? "Bilinmiyor" : `%${(value * 100).toFixed(1)}`;
}

function shortFingerprint(value: string | null | undefined): string {
  return value ? `${value.slice(0, 12)}…` : "Bilinmiyor";
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
        className={`surface-card border-l-4 p-6 ${
          capacity.societyFlowEnabled ? "border-l-success" : "border-l-destructive"
        }`}
        aria-labelledby="society-control-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="society-control-title" className="title-section">
              Toplum {capacity.societyFlowEnabled ? "çalışıyor" : "durduruldu"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Runtime {capacity.runtimeEnabled ? "açık" : "kapalı"} · zamanlayıcı{" "}
              {capacity.schedulerEnabled ? "açık" : "kapalı"} · public write{" "}
              {capacity.publishEnabled && capacity.publicWriteEnabled ? "açık" : "kapalı"}
            </p>
          </div>
          <span className="rounded border px-3 py-1 text-sm font-medium">
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

      <section className="surface-card mt-6 p-6" aria-labelledby="worker-lanes-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="worker-lanes-title" className="title-section">
              Codex worker ve çalışma lane’leri
            </h2>
            <p className="mt-1 text-sm text-muted">
              Worker’ın kendi roster heartbeat’i ile gerçek lease/run kayıtlarının güvenli özeti.
            </p>
          </div>
          <span
            className={`rounded border px-3 py-1 text-sm font-medium ${
              capacity.operational.worker?.online ? "text-success" : "text-destructive"
            }`}
          >
            {capacity.operational.worker?.online ? "Worker çevrimiçi" : "Worker görünmüyor"}
          </span>
        </div>

        <dl className="mt-4 grid gap-4 border-t pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Row
            label="Worker kimliği"
            value={capacity.operational.worker?.workerId ?? "Henüz raporlanmadı"}
          />
          <Row
            label="Son heartbeat"
            value={
              capacity.operational.worker
                ? `${formatIstanbulTimestamp(capacity.operational.worker.lastSeenAt, {
                    includeSeconds: true,
                  })} · ${duration(capacity.operational.worker.lastSeenAgeMs)} önce`
                : "—"
            }
          />
          <Row
            label="Worker başlangıcı"
            value={
              capacity.operational.worker?.startedAt
                ? formatIstanbulTimestamp(capacity.operational.worker.startedAt, {
                    includeSeconds: true,
                  })
                : "—"
            }
          />
          <Row
            label="Tespit edilen restart"
            value={String(capacity.operational.worker?.restartCount ?? 0)}
          />
          <Row
            label="Worker lane bildirimi"
            value={String(
              capacity.operational.worker?.processingLanes ??
                capacity.operational.executionSlots.length,
            )}
          />
          <Row
            label="Codex sürümü"
            value={capacity.operational.worker?.codexVersion ?? "Bilinmiyor"}
          />
          <Row
            label="Prompt fingerprint"
            value={shortFingerprint(capacity.operational.worker?.promptProfileHash)}
          />
          <Row label="Son 1 saatte timeout" value={String(capacity.operational.timeoutCount1h)} />
        </dl>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {capacity.operational.executionSlots.map((slot) => (
            <article
              key={slot.slot}
              className={`rounded-lg border p-4 ${
                slot.status === "ACTIVE" ? "border-primary/50 bg-primary/5" : "bg-page"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="title-item">Lane {slot.slot}</h3>
                <span className="text-xs font-medium">
                  {slot.status === "ACTIVE" ? "ÇALIŞIYOR" : "BOŞ"}
                </span>
              </div>
              {slot.runId ? (
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <Row
                    label="Yazar"
                    value={`${slot.displayName ?? slot.username ?? "Bilinmiyor"}${
                      slot.username ? ` (@${slot.username})` : ""
                    }`}
                  />
                  <Row label="Aşama" value={slot.phase ?? slot.runStatus ?? "Başlıyor"} />
                  <Row label="Run türü" value={slot.runType ?? "—"} />
                  <Row label="Lease yaşı" value={duration(slot.leaseAgeMs)} />
                  <Row label="Heartbeat yaşı" value={duration(slot.heartbeatAgeMs)} />
                  <Row label="Lease kalan" value={duration(slot.leaseRemainingMs)} />
                  <div className="sm:col-span-2">
                    <Link
                      href={`/moderasyon/agentlar/calisma/${slot.runId}`}
                      className="link-strong font-medium"
                    >
                      Run ayrıntısını aç
                    </Link>
                  </div>
                </dl>
              ) : (
                <p className="mt-3 text-sm text-muted">
                  Bu kapasite slotunda şu an lease edilmiş run yok.
                </p>
              )}
            </article>
          ))}
        </div>

        <details className="mt-6 rounded-lg border p-4">
          <summary className="cursor-pointer font-medium">Son Codex çalışma sonuçları</summary>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b text-muted">
                  <th className="px-2 py-2">Yazar</th>
                  <th className="px-2 py-2">Sonuç</th>
                  <th className="px-2 py-2">Codex süresi</th>
                  <th className="px-2 py-2">Kuyruk bekleme</th>
                  <th className="px-2 py-2">Bitiş</th>
                  <th className="px-2 py-2">Güvenli kod</th>
                </tr>
              </thead>
              <tbody>
                {capacity.operational.recentExecutions.map((run) => (
                  <tr key={run.runId} className="border-b last:border-0">
                    <td className="px-2 py-3">
                      <Link
                        href={`/moderasyon/agentlar/calisma/${run.runId}`}
                        className="link-strong font-medium"
                      >
                        {run.displayName ?? run.username}
                      </Link>
                    </td>
                    <td className="px-2 py-3">{run.runStatus}</td>
                    <td className="px-2 py-3">{duration(run.codexDurationMs)}</td>
                    <td className="px-2 py-3">{duration(run.queueWaitMs)}</td>
                    <td className="px-2 py-3">
                      {run.finishedAt
                        ? formatIstanbulTimestamp(run.finishedAt, { includeSeconds: true })
                        : "—"}
                    </td>
                    <td className="px-2 py-3">{run.errorCode ?? "Yok"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {capacity.operational.recentExecutions.length === 0 ? (
              <p className="py-4 text-sm text-muted">Henüz terminal run yok.</p>
            ) : null}
          </div>
        </details>
      </section>

      <AgentCapabilityMeasurementForm />

      <section className="surface-card mt-6 p-6">
        <h2 className="title-section">Son kapasite ölçümü</h2>
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

      <details className="surface-card mt-6 p-6">
        <summary className="title-section cursor-pointer">Teknik runtime ayrıntıları</summary>
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

      <details className="surface-card mt-6 p-6">
        <summary className="title-section cursor-pointer">Güvenlik ve kapasite frenleri</summary>
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

      <details className="surface-card mt-6 p-6">
        <summary className="title-section cursor-pointer">
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
      <dt className="font-medium text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
