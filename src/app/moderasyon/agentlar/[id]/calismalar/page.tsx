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

const actionStatusLabels: Record<string, string> = {
  SUCCEEDED: "başarılı",
  REJECTED: "reddedildi",
  FAILED: "başarısız",
  SKIPPED: "atlandı",
  PROPOSED: "önerildi",
  VALIDATING: "doğrulanıyor",
  ACCEPTED: "kabul edildi",
  EXECUTING: "uygulanıyor",
};

function runOutcomeSummary(run: {
  runStatus: string;
  errorCode: string | null;
  actions: Array<{
    id: string;
    actionStatus: string;
    rejectionCode: string | null;
    rejectionReason: string | null;
  }>;
}) {
  const succeeded = run.actions.filter(({ actionStatus }) => actionStatus === "SUCCEEDED").length;
  const unsuccessful = run.actions.filter(({ actionStatus }) =>
    ["REJECTED", "FAILED", "SKIPPED"].includes(actionStatus),
  );
  const classes = new Map<string, number>();
  for (const action of unsuccessful) {
    const key = action.rejectionCode ?? action.actionStatus;
    classes.set(key, (classes.get(key) ?? 0) + 1);
  }
  return {
    succeeded,
    unsuccessful,
    classes: [...classes.entries()],
    needsExplanation:
      run.runStatus === "PARTIAL" || unsuccessful.length > 0 || Boolean(run.errorCode),
  };
}

export default async function AgentRunsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAgentAdminPage();
  const agent = await getAgentDetail(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
    parseUuid((await params).id, "id"),
  );
  const outcomes = new Map(agent.runs.map((run) => [run.id, runOutcomeSummary(run)]));
  const rejectionClasses = new Map<string, number>();
  let unsuccessfulActionCount = 0;
  for (const outcome of outcomes.values()) {
    unsuccessfulActionCount += outcome.unsuccessful.length;
    for (const [code, count] of outcome.classes)
      rejectionClasses.set(code, (rejectionClasses.get(code) ?? 0) + count);
  }
  const partialRunCount = agent.runs.filter(({ runStatus }) => runStatus === "PARTIAL").length;
  return (
    <ModerationLayout
      title={`${agent.user.displayName} çalışmaları`}
      description="Güvenli run özeti; özel muhakeme dökümü gösterilmez."
    >
      {agent.lifecycleStatus === "ACTIVE" ? <ManualAgentRunForm agentId={agent.id} /> : null}
      <section className="surface-card mb-5 p-4 text-sm" aria-labelledby="run-distribution-title">
        <h2 id="run-distribution-title" className="font-black">
          Son {agent.runs.length} çalışma dağılımı
        </h2>
        <p className="mt-1 text-muted">
          {partialRunCount} PARTIAL çalışma · {unsuccessfulActionCount} uygulanmayan aksiyon
        </p>
        {rejectionClasses.size > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Toplam reddetme sınıfları">
            {[...rejectionClasses.entries()].map(([code, count]) => (
              <li key={code} className="rounded-md bg-page px-2 py-1 font-mono text-xs">
                {code} ×{count}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted">Bu pencerede reddedilen aksiyon yok.</p>
        )}
      </section>
      <div className="space-y-3">
        {agent.runs.map((run) => {
          const outcome = outcomes.get(run.id)!;
          return (
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
              {run.errorSummary ? (
                <p className="mt-2 text-destructive">{run.errorSummary}</p>
              ) : null}
              {outcome.needsExplanation ? (
                <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="font-bold">
                    {run.runStatus === "PARTIAL" ? "PARTIAL nedeni" : "Uygulanmayan aksiyonlar"}:{" "}
                    {outcome.succeeded} başarılı, {outcome.unsuccessful.length} uygulanmadı
                    {run.errorCode ? ` · ${run.errorCode}` : ""}
                  </p>
                  {outcome.classes.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-2" aria-label="Reddetme sınıfları">
                      {outcome.classes.map(([code, count]) => (
                        <li key={code} className="rounded-md bg-page px-2 py-1 font-mono text-xs">
                          {code} ×{count}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {outcome.unsuccessful.some(({ rejectionReason }) => rejectionReason) ? (
                    <ul className="mt-2 space-y-1 text-xs text-destructive">
                      {outcome.unsuccessful.flatMap((action) =>
                        action.rejectionReason
                          ? [
                              <li key={action.id}>
                                {actionStatusLabels[action.actionStatus] ?? action.actionStatus}:{" "}
                                {action.rejectionReason}
                              </li>,
                            ]
                          : [],
                      )}
                    </ul>
                  ) : null}
                </div>
              ) : null}
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
          );
        })}
      </div>
      {agent.runs.length === 0 ? (
        <p className="surface-card p-6 text-muted">Henüz run yok.</p>
      ) : null}
    </ModerationLayout>
  );
}
