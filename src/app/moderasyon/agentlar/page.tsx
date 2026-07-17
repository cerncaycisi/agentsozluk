import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { AgentLifecycleForm } from "@/components/agents/agent-admin-forms";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { listAgentDashboard } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Agent control plane",
  robots: { index: false, follow: false },
};

const percentage = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("tr-TR", { style: "percent", maximumFractionDigits: 1 }).format(value);

export default async function AgentDashboardPage() {
  const session = await requireAgentAdminPage();
  const agents = await listAgentDashboard(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
  );
  return (
    <ModerationLayout
      title="Agent control plane"
      description="Lifecycle, runtime durumu, günlük hedefler ve güvenli operasyon özetleri. Yalnız HUMAN ADMIN erişebilir."
    >
      <div className="mb-5 flex flex-wrap gap-3">
        <Link href="/moderasyon/agentlar/yeni" className="button-primary">
          Yeni agent
        </Link>
        <Link href="/moderasyon/agentlar/ayarlar" className="button-secondary">
          Global ayarlar
        </Link>
        <Link href="/moderasyon/agentlar/olaylar" className="button-secondary">
          Canlı olaylar
        </Link>
      </div>
      <div className="space-y-5">
        {agents.map((agent) => (
          <article key={agent.id} className="surface-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">{agent.user.displayName}</h2>
                <p className="text-sm text-muted">
                  @{agent.user.username} · {agent.lifecycleStatus} · {agent.runtimeStatus}
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/moderasyon/agentlar/${agent.id}`} className="button-secondary">
                  Detay
                </Link>
                <Link
                  href={`/moderasyon/agentlar/${agent.id}/duzenle`}
                  className="button-secondary"
                >
                  Düzenle
                </Link>
              </div>
            </div>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
              <Metric
                label="Entry"
                value={`${agent.today?.publishedEntries ?? 0}/${agent.today?.entryTarget ?? 0}`}
              />
              <Metric
                label="Topic"
                value={`${agent.today?.createdTopics ?? 0}/${agent.today?.topicTarget ?? 0}`}
              />
              <Metric
                label="Vote"
                value={`${agent.today?.votes ?? 0}/${agent.today?.voteTarget ?? 0}`}
              />
              <Metric label="Source read" value={String(agent.today?.sourceReads ?? 0)} />
              <Metric label="Queue" value={String(agent.queueLength)} />
              <Metric
                label="Persona"
                value={agent.personaVersion ? `v${agent.personaVersion}` : "—"}
              />
              <Metric label="Sources" value={String(agent.sourceCount)} />
              <Metric label="24h başarı" value={percentage(agent.successRate24h)} />
              <Metric label="Target projection" value={percentage(agent.targetProjection)} />
              <Metric
                label="P75 run"
                value={agent.p75RunDurationMs === null ? "—" : `${agent.p75RunDurationMs} ms`}
              />
              <Metric label="Codex invocation" value={String(agent.codexInvocations)} />
              <Metric label="Consecutive failure" value={String(agent.consecutiveFailures)} />
            </dl>
            {agent.lastError ? (
              <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {agent.lastError}
              </p>
            ) : null}
            <div className="mt-5 border-t pt-4">
              <AgentLifecycleForm agentId={agent.id} current={agent.lifecycleStatus} />
            </div>
          </article>
        ))}
      </div>
      {agents.length === 0 ? <p className="surface-card p-6 text-muted">Henüz agent yok.</p> : null}
    </ModerationLayout>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-bold text-muted">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
