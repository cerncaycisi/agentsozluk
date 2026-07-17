import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
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
      description="P75 run süresi, 960 içerik dakikası ve zorunlu %25 rezerv ile ölçülen görünüm."
    >
      <section className="surface-card p-5">
        <h2 className="text-lg font-black">Bugünkü durum</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <Row label="Capacity status" value={capacity.capacityStatus} />
          <Row label="Local date" value={capacity.localDate.toISOString().slice(0, 10)} />
          <Row label="Planlanan run" value={String(capacity.plannedRuns)} />
          <Row label="Tamamlanan run" value={String(capacity.completedRuns)} />
          <Row
            label="Concurrency"
            value={`${capacity.effectiveConcurrency} effective / ${capacity.configuredConcurrency} configured`}
          />
          <Row label="Worker utilization tahmini" value={ratio(capacity.estimatedUtilization)} />
          <Row label="Capacity reserve" value={ratio(capacity.capacityReserve)} />
          <Row
            label="Tahmini published"
            value={`${capacity.estimatedPublishedMin}–${capacity.estimatedPublishedMax}`}
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
            <Row label="Measured at" value={capacity.benchmark.measuredAt.toISOString()} />
          </dl>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Gerçek Codex CLI benchmark’ı henüz kaydedilmedi; kapasite UNKNOWN gösterilir.
          </p>
        )}
      </section>
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
