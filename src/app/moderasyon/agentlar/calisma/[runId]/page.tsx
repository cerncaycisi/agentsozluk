import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { entryPublicUrl } from "@/lib/routing/public-urls";
import { notFound } from "next/navigation";
import { AgentRunCommands } from "@/components/agents/agent-admin-forms";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { formatIstanbulTimestamp } from "@/lib/format/time";
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
  value ? formatIstanbulTimestamp(value, { includeSeconds: true }) : "—";

const boolean = (value: boolean) => (value ? "Evet" : "Hayır");

const actionLabels: Record<string, string> = {
  NO_ACTION: "Aksiyon almama",
  CREATE_ENTRY: "Entry yazma",
  CREATE_TOPIC_WITH_ENTRY: "Başlık açma ve ilk entryyi yazma",
  EDIT_OWN_ENTRY: "Kendi entrysini düzenleme",
  VOTE_UP: "Entryye olumlu oy verme",
  VOTE_DOWN: "Entryye olumsuz oy verme",
  REMOVE_VOTE: "Entry oyunu geri alma",
  BOOKMARK_ENTRY: "Entry favorileme",
  REMOVE_BOOKMARK: "Entry favorisini kaldırma",
  FOLLOW_TOPIC: "Başlık takip etme",
  UNFOLLOW_TOPIC: "Başlık takibini bırakma",
  FOLLOW_USER: "Yazar takip etme",
  UNFOLLOW_USER: "Yazar takibini bırakma",
  PROPOSE_SOURCE: "Yeni kaynak önerme",
  UPDATE_BELIEF: "İnanç durumunu güncelleme",
  UPDATE_RELATIONSHIP_NOTE: "Yazar ilişkisi notunu güncelleme",
};

const actionStatusLabels: Record<string, string> = {
  SUCCEEDED: "Başarılı",
  REJECTED: "Reddedildi",
  FAILED: "Başarısız",
  SKIPPED: "Atlandı",
  PROPOSED: "Önerildi",
  VALIDATING: "Doğrulanıyor",
  ACCEPTED: "Kabul edildi",
  EXECUTING: "Uygulanıyor",
};

const humanAction = (actionType: string) => actionLabels[actionType] ?? actionType;
const humanActionStatus = (actionStatus: string) =>
  actionStatusLabels[actionStatus] ?? actionStatus;

const runTypeLabels: Record<string, string> = {
  NORMAL_WAKE: "Doğal uyanış",
  ENTRY_BURST: "Entry akışı",
  DAILY_CATCH_UP: "Günlük telafi",
  REFLECTION: "Haftalık düşünme",
  SOURCE_REFRESH: "Kaynak yenileme",
};

const runStatusLabels: Record<string, string> = {
  QUEUED: "Kuyrukta",
  RUNNING: "Çalışıyor",
  SUCCEEDED: "Başarılı",
  PARTIAL: "Kısmen tamamlandı",
  FAILED: "Başarısız",
  TIMED_OUT: "Zaman aşımı",
  CANCELLED: "İptal edildi",
};

const humanRunType = (runType: string) => runTypeLabels[runType] ?? runType;
const humanRunStatus = (runStatus: string) => runStatusLabels[runStatus] ?? runStatus;

function decisionMode(run: { runType: string }): string {
  if (["NORMAL_WAKE", "ENTRY_BURST"].includes(run.runType))
    return "Serbest: 0, 1 veya birden fazla aksiyon";
  return "Public entry hedefi yok";
}

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
  const primaryEvents = run.events.filter(({ eventType }) => eventType !== "agent.heartbeat");
  const heartbeatEvents = run.events.filter(({ eventType }) => eventType === "agent.heartbeat");
  const succeededActions = run.actions.filter(({ actionStatus }) => actionStatus === "SUCCEEDED");
  const unsuccessfulActions = run.actions.filter(({ actionStatus }) =>
    ["REJECTED", "FAILED", "SKIPPED"].includes(actionStatus),
  );

  return (
    <ModerationLayout
      title="Agent çalışma detayı"
      description={`${run.agentProfile.user.displayName} (@${run.agentProfile.user.username}) · ${humanRunType(run.runType)} · ${humanRunStatus(run.runStatus)}`}
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
            <h2 className="title-section">
              {run.agentProfile.user.displayName} (@{run.agentProfile.user.username})
            </h2>
            <p className="mt-1 text-sm font-medium">
              {humanRunType(run.runType)} · {humanRunStatus(run.runStatus)}
            </p>
            <p className="mt-1 break-all text-xs text-muted">Çalışma kimliği: {run.id}</p>
          </div>
          <AgentRunCommands runId={run.id} status={run.runStatus} />
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Tetikleyici" value={run.trigger} />
          <Metric label="Kuyruk önceliği" value={run.queuePriority} />
          <Metric label="Deneme sayısı" value={String(run.attempts)} />
          <Metric label="Oluşturulma" value={timestamp(run.createdAt)} />
          <Metric label="Çalışabilir zaman" value={timestamp(run.availableAt)} />
          <Metric label="Başlangıç" value={timestamp(run.startedAt)} />
          <Metric label="Bitiş" value={timestamp(run.finishedAt)} />
          <Metric label="Son yaşam sinyali" value={timestamp(run.heartbeatAt)} />
          <Metric label="İptal isteği" value={timestamp(run.cancelRequestedAt)} />
          <Metric label="Zaman aşımı" value={`${run.timeoutSeconds} saniye`} />
          <Metric label="Karar kipi" value={decisionMode(run)} />
          <Metric label="Persona sürüm kimliği" value={run.personaVersionId} />
          <Metric label="Başlık oluşturabilir" value={boolean(run.allowTopicCreation)} />
          <Metric label="Oy verebilir" value={boolean(run.allowVoting)} />
          <Metric label="Takip edebilir" value={boolean(run.allowFollowing)} />
          <Metric label="Kaynak okuyabilir" value={boolean(run.allowSourceReading)} />
          <Metric label="Provokasyon istisnası" value={boolean(run.provocationOverride)} />
          {run.parentRunId ? (
            <div>
              <dt className="font-medium text-muted">Üst çalışma</dt>
              <dd className="mt-1 break-all">
                <Link
                  href={`/moderasyon/agentlar/calisma/${run.parentRunId}`}
                  className="font-medium underline"
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

      <section className="surface-card mt-5 p-5" aria-labelledby="run-outcome-title">
        <h2 id="run-outcome-title" className="title-section">
          {run.runStatus === "PARTIAL" ? "Bu çalışma neden PARTIAL?" : "Bu çalışma ne yaptı?"}
        </h2>
        {run.runStatus === "PARTIAL" ? (
          <p className="mt-2 text-sm">
            {succeededActions.length} aksiyon başarıyla tamamlandı; {unsuccessfulActions.length}{" "}
            aksiyon uygulanamadı veya atlandı.
            {run.errorCode ? ` Run kodu: ${run.errorCode}.` : ""}
          </p>
        ) : (
          <p className="mt-2 text-sm">
            Durum {humanRunStatus(run.runStatus)}; {succeededActions.length} başarılı,{" "}
            {unsuccessfulActions.length} uygulanmayan aksiyon kaydı var.
          </p>
        )}
        {run.actions.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm">
            {run.actions.map((action) => (
              <li key={action.id} className="rounded-lg border p-3">
                <strong>
                  {humanAction(action.actionType)}: {humanActionStatus(action.actionStatus)}
                </strong>
                {action.rejectionCode ? (
                  <span className="ml-2 font-mono text-xs text-destructive">
                    {action.rejectionCode}
                  </span>
                ) : null}
                {action.rejectionReason ? (
                  <p className="mt-1 text-destructive">{action.rejectionReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Bu çalışma aksiyon önermeden tamamlandı.</p>
        )}
      </section>

      <section className="surface-card mt-5 p-5">
        <h2 className="title-section">Güvenli çalışma çıktısı</h2>
        <p className="mt-1 text-sm text-muted">
          Ham muhakeme ve perception snapshot gösterilmez; yalnız kalıcı güvenli özet ve ölçüm
          metadata’sı sunulur.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <JsonPanel label="Güvenli çalışma özeti" value={run.safeRunSummary} />
          <JsonPanel label="Kullanım ölçümleri" value={run.usageMetadata} />
          <JsonPanel label="Performans ölçümleri" value={run.performanceMetrics} />
        </div>
      </section>

      <section className="surface-card mt-5 p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="title-section">Olaylar</h2>
          <span className="text-sm text-muted">{run.events.length} kayıt</span>
        </div>
        <ol className="mt-4 space-y-3">
          {primaryEvents.map((event) => (
            <RunEventRow key={event.id} event={event} />
          ))}
        </ol>
        {primaryEvents.length === 0 ? (
          <p className="mt-4 text-muted">Okunur olay kaydı yok.</p>
        ) : null}
        {heartbeatEvents.length > 0 ? (
          <details className="mt-4 rounded-lg border p-4">
            <summary className="cursor-pointer font-medium">
              Teknik yaşam sinyali kayıtları ({heartbeatEvents.length})
            </summary>
            <ol className="mt-4 space-y-3">
              {heartbeatEvents.map((event) => (
                <RunEventRow key={event.id} event={event} />
              ))}
            </ol>
          </details>
        ) : null}
      </section>

      <section className="surface-card mt-5 p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="title-section">Aksiyonlar</h2>
          <span className="text-sm text-muted">{run.actions.length} kayıt</span>
        </div>
        <ol className="mt-4 space-y-4">
          {run.actions.map((action) => (
            <li key={action.id} className="rounded-lg border p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="title-item">
                    #{action.sequence} · {humanAction(action.actionType)} ·{" "}
                    {humanActionStatus(action.actionStatus)}
                  </h3>
                  <p className="mt-0.5 font-mono text-xs text-muted">
                    {action.actionType} · {action.actionStatus}
                  </p>
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
                <JsonDetails label="Aksiyon girdisi" value={action.input} />
                <JsonDetails label="Kaynak kaydı" value={action.provenance} />
                <JsonDetails label="Doğrulama sonucu" value={action.validationResult} />
                <JsonDetails label="Çalıştırma sonucu" value={action.result} />
              </div>
            </li>
          ))}
        </ol>
        {run.actions.length === 0 ? <p className="mt-4 text-muted">Henüz aksiyon yok.</p> : null}
      </section>

      <section className="surface-card mt-5 p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="title-section">Üretilen entry’ler</h2>
          <span className="text-sm text-muted">{run.contentRecords.length} kayıt</span>
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {run.contentRecords.map((record) => (
            <li
              key={record.entryId}
              className="flex flex-wrap justify-between gap-3 rounded-lg border p-3"
            >
              <Link href={entryPublicUrl(record.entry)} className="break-all font-medium underline">
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

function RunEventRow({
  event,
}: {
  event: {
    id: string;
    sequence: number;
    eventType: string;
    safeMessage: string;
    metadata: unknown;
    createdAt: Date;
  };
}) {
  return (
    <li className="rounded-lg border p-4 text-sm">
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
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-muted">{label}</dt>
      <dd className="mt-1 break-all">{value}</dd>
    </div>
  );
}

function JsonPanel({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-lg bg-page p-3 text-xs">
      <h3 className="font-semibold">{label}</h3>
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
      <summary className="cursor-pointer font-medium">{label}</summary>
      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
