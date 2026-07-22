import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { AgentCapabilityMeasurementForm } from "@/components/agents/agent-capability-measurement-form";
import { GlobalRunControlForm } from "@/components/agents/global-run-control-form";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { RuntimeControlForm } from "@/components/agents/agent-admin-forms";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { formatIstanbulTimestamp } from "@/lib/format/time";
import { getRuntimeCapacity } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Agent kapasitesi",
  robots: { index: false, follow: false },
};

function duration(value: number | null | undefined): string {
  return value === null || value === undefined ? "UNKNOWN" : `${(value / 60_000).toFixed(1)} dk`;
}

function ratio(value: number | null): string {
  return value === null ? "UNKNOWN" : `%${(value * 100).toFixed(1)}`;
}

export default async function AgentCapacityPage() {
  const session = await requireAgentAdminPage();
  const capacity = await getRuntimeCapacity(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
  );
  return (
    <ModerationLayout
      title="Agent kapasitesi"
      description="P75 run süresi, canlı queue, gerçek utilization ve zorunlu kapasite rezervi."
    >
      <section className="surface-card p-5">
        <h2 className="text-lg font-black">Bugünkü durum</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <Row label="Capacity status" value={capacity.capacityStatus} />
          <Row label="Global runtime" value={capacity.runtimeEnabled ? "ENABLED" : "PAUSED"} />
          <Row label="Local date" value={capacity.localDate.toISOString().slice(0, 10)} />
          <Row
            label="Eligible queued run"
            value={String(capacity.operational.eligibleQueuedRunCount)}
          />
          <Row label="Aktif run" value={String(capacity.operational.activeRunStartedAts.length)} />
          <Row
            label="Concurrency"
            value={`${capacity.effectiveConcurrency} effective / ${capacity.configuredConcurrency} configured`}
          />
          <Row label="Worker utilization tahmini" value={ratio(capacity.estimatedUtilization)} />
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
          <Row label="Capacity reserve" value={ratio(capacity.capacityReserve)} />
          <Row label="Capacity warnings" value={capacity.warnings.join(", ") || "—"} />
          <Row
            label="En eski queued"
            value={
              capacity.operational.oldestQueuedAt
                ? formatIstanbulTimestamp(capacity.operational.oldestQueuedAt, {
                    includeSeconds: true,
                  })
                : "—"
            }
          />
          <Row label="Queue lag" value={duration(capacity.queueLagMs)} />
          <Row
            label="Estimated completion"
            value={
              capacity.estimatedCompletionAt
                ? `${formatIstanbulTimestamp(capacity.estimatedCompletionAt, { includeSeconds: true })} · ${duration(capacity.estimatedCompletionDurationMs)} · P75`
                : "UNKNOWN"
            }
          />
          <Row
            label="En uzun active başlangıcı"
            value={
              capacity.operational.longestActiveStartedAt
                ? formatIstanbulTimestamp(capacity.operational.longestActiveStartedAt, {
                    includeSeconds: true,
                  })
                : "—"
            }
          />
        </dl>
        <RuntimeControlForm runtimeEnabled={capacity.runtimeEnabled} />
        <GlobalRunControlForm />
      </section>
      <section className="surface-card mt-5 p-5">
        <h2 className="text-lg font-black">Circuit breakers</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          {capacity.circuitBreakers.breakers.map((breaker) => (
            <Row
              key={breaker.code}
              label={breaker.code}
              value={`${breaker.active ? "ACTIVE" : "OK"} · ${breaker.measured ?? "UNKNOWN"} / ${breaker.threshold}`}
            />
          ))}
          <Row
            label="Write lane"
            value={capacity.circuitBreakers.writeRunsPaused ? "PAUSED" : "OPEN"}
          />
          <Row
            label="Duplicate slowdown"
            value={capacity.circuitBreakers.contentSlowdown ? "ACTIVE" : "OFF"}
          />
        </dl>
      </section>
      <section className="surface-card mt-5 p-5">
        <h2 className="text-lg font-black">Benchmark</h2>
        {capacity.benchmark ? (
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <Row label="Run count" value={String(capacity.benchmark.runCount)} />
            <Row label="P50" value={duration(capacity.benchmark.p50DurationMs)} />
            <Row label="P75" value={duration(capacity.benchmark.p75DurationMs)} />
            <Row label="P95" value={duration(capacity.benchmark.p95DurationMs)} />
            <Row label="Max" value={duration(capacity.benchmark.maxDurationMs)} />
            <Row label="Stale" value={capacity.benchmark.stale ? "Evet" : "Hayır"} />
            <Row
              label="Stale nedenleri"
              value={capacity.benchmark.staleReasons.join(", ") || "—"}
            />
            <Row
              label="Measured at"
              value={formatIstanbulTimestamp(capacity.benchmark.measuredAt, {
                includeSeconds: true,
              })}
            />
          </dl>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Gerçek Codex CLI benchmark’ı henüz kaydedilmedi; kapasite UNKNOWN gösterilir.
          </p>
        )}
      </section>
      <AgentCapabilityMeasurementForm />
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
