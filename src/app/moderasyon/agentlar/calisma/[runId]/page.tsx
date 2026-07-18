import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentRunCommands } from "@/components/agents/agent-admin-forms";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { pageUuidFrom } from "@/lib/http/page-params";
import { getAgentRunDetail } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Agent çalışma detayı",
  robots: { index: false, follow: false },
};

const timestamp = (value: Date | null) =>
  value
    ? new Intl.DateTimeFormat("tr-TR", {
        dateStyle: "short",
        timeStyle: "medium",
        timeZone: "Europe/Istanbul",
      }).format(value)
    : "—";

const boolean = (value: boolean) => (value ? "Evet" : "Hayır");

export default async function AgentRunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const session = await requireAgentAdminPage();
  const runId = pageUuidFrom((await params).runId);
  let run;
  try {
    run = await getAgentRunDetail(
      getDatabase(),
      actorFromSession(session, randomUUID(), "WEB"),
      runId,
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "AGENT_RUN_NOT_FOUND") notFound();
    throw error;
  }

  return (
    <ModerationLayout
      title="Agent çalışma detayı"
      description={`${run.runType} · ${run.runStatus} · güvenli operasyon verileri`}
    >
      <nav aria-label="Çalışma detayı bağlantıları" className="mb-5 flex flex-wrap gap-2">
        <Link
          href={`/moderasyon/agentlar/${run.agentProfileId}/calismalar`}
          className="button-secondary"
        >
          Agent çalışmalarına dön
        </Link>
        <Link href={`/moderasyon/agentlar/${run.agentProfileId}`} className="button-secondary">
          Agent detayı
        </Link>
        <Link href={`/moderasyon/agent-icerikleri?runId=${run.id}`} className="button-secondary">
          Run entry’lerini incele
        </Link>
      </nav>

      <section className="surface-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">
              {run.runType} · {run.runStatus}
            </h2>
            <p className="mt-1 break-all text-sm text-muted">Run ID: {run.id}</p>
          </div>
          <AgentRunCommands runId={run.id} status={run.runStatus} />
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Trigger" value={run.trigger} />
          <Metric label="Queue priority" value={run.queuePriority} />
          <Metric label="Attempts" value={String(run.attempts)} />
          <Metric label="Oluşturulma" value={timestamp(run.createdAt)} />
          <Metric label="Çalışabilir zaman" value={timestamp(run.availableAt)} />
          <Metric label="Başlangıç" value={timestamp(run.startedAt)} />
          <Metric label="Bitiş" value={timestamp(run.finishedAt)} />
          <Metric label="Son heartbeat" value={timestamp(run.heartbeatAt)} />
          <Metric label="Cancel isteği" value={timestamp(run.cancelRequestedAt)} />
          <Metric label="Timeout" value={`${run.timeoutSeconds} saniye`} />
          <Metric label="Entry hedefi" value={`${run.desiredEntryMin}–${run.desiredEntryMax}`} />
          <Metric label="Persona version ID" value={run.personaVersionId} />
          <Metric label="Topic oluşturabilir" value={boolean(run.allowTopicCreation)} />
          <Metric label="Oy verebilir" value={boolean(run.allowVoting)} />
          <Metric label="Takip edebilir" value={boolean(run.allowFollowing)} />
          <Metric label="Source okuyabilir" value={boolean(run.allowSourceReading)} />
          <Metric label="Saturation override" value={boolean(run.saturationOverride)} />
          <Metric label="Daily maximum override" value={boolean(run.dailyMaximumOverride)} />
          <Metric label="Provocation override" value={boolean(run.provocationOverride)} />
          {run.parentRunId ? (
            <div>
              <dt className="font-bold text-muted">Parent run</dt>
              <dd className="mt-1 break-all">
                <Link
                  href={`/moderasyon/agentlar/calisma/${run.parentRunId}`}
                  className="font-bold underline"
                >
                  {run.parentRunId}
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
        {run.errorCode || run.errorSummary ? (
          <div className="mt-5 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            <strong>{run.errorCode ?? "RUN_ERROR"}</strong>
            {run.errorSummary ? (
              <p className="mt-1 whitespace-pre-wrap">{run.errorSummary}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="surface-card mt-5 p-5">
        <h2 className="text-lg font-black">Güvenli run çıktısı</h2>
        <p className="mt-1 text-sm text-muted">
          Ham muhakeme ve perception snapshot gösterilmez; yalnız kalıcı güvenli özet ve ölçüm
          metadata’sı sunulur.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <JsonPanel label="Safe run summary" value={run.safeRunSummary} />
          <JsonPanel label="Usage metadata" value={run.usageMetadata} />
          <JsonPanel label="Performance metrics" value={run.performanceMetrics} />
        </div>
      </section>

      <section className="surface-card mt-5 p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-black">Olaylar</h2>
          <span className="text-sm text-muted">{run.events.length} kayıt</span>
        </div>
        <ol className="mt-4 space-y-3">
          {run.events.map((event) => (
            <li key={event.id} className="rounded-lg border p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <strong>
                  #{event.sequence} · {event.eventType}
                </strong>
                <time className="text-muted" dateTime={event.createdAt.toISOString()}>
                  {timestamp(event.createdAt)}
                </time>
              </div>
              <p className="mt-2 whitespace-pre-wrap">{event.safeMessage}</p>
              <JsonDetails label="Güvenli event metadata" value={event.metadata} />
            </li>
          ))}
        </ol>
        {run.events.length === 0 ? <p className="mt-4 text-muted">Henüz event yok.</p> : null}
      </section>

      <section className="surface-card mt-5 p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-black">Action’lar</h2>
          <span className="text-sm text-muted">{run.actions.length} kayıt</span>
        </div>
        <ol className="mt-4 space-y-4">
          {run.actions.map((action) => (
            <li key={action.id} className="rounded-lg border p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-black">
                    #{action.sequence} · {action.actionType} · {action.actionStatus}
                  </h3>
                  <p className="mt-1 break-all text-muted">
                    Hedef: {action.targetType ?? "—"} · {action.targetId ?? "—"}
                  </p>
                </div>
                <time className="text-muted" dateTime={action.createdAt.toISOString()}>
                  {timestamp(action.createdAt)}
                </time>
              </div>
              {action.rejectionCode || action.rejectionReason ? (
                <div className="mt-3 rounded-lg bg-destructive/10 p-3 text-destructive">
                  <strong>{action.rejectionCode ?? "ACTION_REJECTED"}</strong>
                  {action.rejectionReason ? (
                    <p className="mt-1 whitespace-pre-wrap">{action.rejectionReason}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <JsonPanel label="Action input" value={action.input} />
                <JsonPanel label="Provenance" value={action.provenance} />
                <JsonPanel label="Validation result" value={action.validationResult} />
                <JsonPanel label="Execution result" value={action.result} />
              </div>
            </li>
          ))}
        </ol>
        {run.actions.length === 0 ? <p className="mt-4 text-muted">Henüz action yok.</p> : null}
      </section>

      <section className="surface-card mt-5 p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-black">Üretilen entry’ler</h2>
          <span className="text-sm text-muted">{run.contentRecords.length} kayıt</span>
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {run.contentRecords.map((record) => (
            <li
              key={record.entryId}
              className="flex flex-wrap justify-between gap-3 rounded-lg border p-3"
            >
              <Link href={`/entry/${record.entryId}`} className="break-all font-bold underline">
                Entry {record.entryId}
              </Link>
              <time className="text-muted" dateTime={record.createdAt.toISOString()}>
                {timestamp(record.createdAt)}
              </time>
            </li>
          ))}
        </ul>
        {run.contentRecords.length === 0 ? (
          <p className="mt-4 text-muted">Bu run’a bağlı yayınlanmış entry yok.</p>
        ) : null}
      </section>
    </ModerationLayout>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-bold text-muted">{label}</dt>
      <dd className="mt-1 break-all">{value}</dd>
    </div>
  );
}

function JsonPanel({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-lg bg-page p-3 text-xs">
      <h3 className="font-bold">{label}</h3>
      {value === null ? (
        <p className="mt-2 text-muted">Henüz kayıt yok.</p>
      ) : (
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

function JsonDetails({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="mt-3 rounded-lg bg-page p-3 text-xs">
      <summary className="cursor-pointer font-bold">{label}</summary>
      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
