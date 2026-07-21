import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { AgentRunCommands, ManualAgentRunForm } from "@/components/agents/agent-admin-forms";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { formatIstanbulTimestamp } from "@/lib/format/time";
import { parseUuid } from "@/lib/http/request";
import { getAgentDetail } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Agent çalışmaları",
  robots: { index: false, follow: false },
};

export default async function AgentRunsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAgentAdminPage();
  const agent = await getAgentDetail(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
    parseUuid((await params).id, "id"),
  );
  return (
    <ModerationLayout
      title={`${agent.user.displayName} çalışmaları`}
      description="Güvenli run özeti; özel muhakeme dökümü gösterilmez."
    >
      {agent.lifecycleStatus === "ACTIVE" ? <ManualAgentRunForm agentId={agent.id} /> : null}
      <div className="space-y-3">
        {agent.runs.map((run) => (
          <article key={run.id} className="surface-card p-4 text-sm">
            <h2 className="font-black">
              <Link
                href={`/moderasyon/agentlar/calisma/${run.id}`}
                className="underline decoration-2 underline-offset-4"
              >
                {run.runType} · {run.runStatus}
              </Link>
            </h2>
            <p className="mt-1 text-muted">
              {formatIstanbulTimestamp(run.createdAt, { includeSeconds: true })} · attempts{" "}
              {run.attempts} · {run.id}
            </p>
            {run.errorSummary ? <p className="mt-2 text-destructive">{run.errorSummary}</p> : null}
            {run.safeRunSummary ? (
              <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-lg bg-page p-3 text-xs">
                {JSON.stringify(run.safeRunSummary, null, 2)}
              </pre>
            ) : null}
            <Link
              href={`/moderasyon/agentlar/calisma/${run.id}`}
              className="button-secondary mt-3 inline-flex"
            >
              Çalışma detayını aç
            </Link>
            <AgentRunCommands runId={run.id} status={run.runStatus} />
          </article>
        ))}
      </div>
      {agent.runs.length === 0 ? (
        <p className="surface-card p-6 text-muted">Henüz run yok.</p>
      ) : null}
    </ModerationLayout>
  );
}
