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

function actualSloMiss(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as Record<string, unknown>;
  if (
    typeof metadata.localDate !== "string" ||
    typeof metadata.targetPublishedEntries !== "number" ||
    typeof metadata.publishedEntries !== "number" ||
    typeof metadata.shortfallEntries !== "number"
  )
    return null;
  return `${metadata.localDate} · target ${metadata.targetPublishedEntries} · actual ${metadata.publishedEntries} · açık ${metadata.shortfallEntries}`;
}

function planningEvidence(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as Record<string, unknown>;
  if (
    metadata.before &&
    typeof metadata.before === "object" &&
    !Array.isArray(metadata.before) &&
    metadata.after &&
    typeof metadata.after === "object" &&
    !Array.isArray(metadata.after)
  ) {
    const before = metadata.before as Record<string, unknown>;
    const after = metadata.after as Record<string, unknown>;
    if (
      typeof before.targetPublishedEntries === "number" &&
      typeof after.targetPublishedEntries === "number" &&
      typeof before.plannedRuns === "number" &&
      typeof after.plannedRuns === "number"
    )
      return `degraded target ${before.targetPublishedEntries}→${after.targetPublishedEntries} · run ${before.plannedRuns}→${after.plannedRuns}`;
  }
  if (
    typeof metadata.targetPublishedEntries === "number" &&
    typeof metadata.projectedPublishedMax === "number" &&
    typeof metadata.projectedShortfallEntries === "number"
  )
    return `projected target ${metadata.targetPublishedEntries} · max ${metadata.projectedPublishedMax} · açık ${metadata.projectedShortfallEntries}`;
  return null;
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
      description="P75 run süresi, 960 içerik dakikası ve zorunlu %25 rezerv ile ölçülen görünüm."
    >
      <section className="surface-card p-5">
        <h2 className="text-lg font-black">Bugünkü durum</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <Row label="Capacity status" value={capacity.capacityStatus} />
          <Row label="Global runtime" value={capacity.runtimeEnabled ? "ENABLED" : "PAUSED"} />
          <Row label="Local date" value={capacity.localDate.toISOString().slice(0, 10)} />
          <Row label="Planlanan run" value={String(capacity.plannedRuns)} />
          <Row label="Tamamlanan run" value={String(capacity.completedRuns)} />
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
          <Row
            label="Tahmini published"
            value={`${capacity.estimatedPublishedMin}–${capacity.estimatedPublishedMax}`}
          />
          <Row label="Günlük published hedefi" value={String(capacity.targetPublishedEntries)} />
          <Row
            label="Kapasiteye göre projected published max"
            value={capacity.projectedPublishedMax?.toString() ?? "UNKNOWN"}
          />
          <Row
            label="Projected target shortfall"
            value={capacity.projectedShortfallEntries?.toString() ?? "UNKNOWN"}
          />
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
          <Row
            label="Son planning evidence"
            value={
              capacity.planningEvidence
                ? (planningEvidence(capacity.planningEvidence.metadata) ??
                  `${capacity.planningEvidence.eventType} · ${formatIstanbulTimestamp(capacity.planningEvidence.createdAt, { includeSeconds: true })}`)
                : "—"
            }
          />
          <Row
            label="Son actual günlük SLO miss"
            value={
              capacity.latestActualSloMiss
                ? (actualSloMiss(capacity.latestActualSloMiss.metadata) ??
                  `${capacity.latestActualSloMiss.eventType} · ${formatIstanbulTimestamp(capacity.latestActualSloMiss.createdAt, { includeSeconds: true })}`)
                : "—"
            }
          />
        </dl>
        {capacity.projectedTargetMiss ? (
          <div className="mt-5 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="font-black">Projected target miss</p>
            <p className="mt-1">
              Ölçülen p75 ve zorunlu kapasite rezervine göre hedef {capacity.targetPublishedEntries}
              , tahmini üst sınır {capacity.projectedPublishedMax ?? "UNKNOWN"}; açık{" "}
              {capacity.projectedShortfallEntries ?? "UNKNOWN"} entry.
            </p>
          </div>
        ) : null}
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
            label="Catch-up"
            value={capacity.circuitBreakers.catchUpFrozen ? "FROZEN" : "OPEN"}
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
