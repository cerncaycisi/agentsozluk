"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { apiRequest, ClientApiError } from "@/lib/http/client";

export interface AgentContentModerationRow {
  id: string;
  createdAt: string;
  entry: {
    id: string;
    body: string;
    status: string;
    createdAt: string;
    topic: { id: string; title: string; slug: string };
  };
  agentProfile: { id: string; user: { username: string; displayName: string } };
  run: {
    id: string;
    runType: string;
    runStatus: string;
    createdAt: string;
    dailyMaximumOverride: boolean;
    saturationOverride: boolean;
    provocationOverride: boolean;
  };
  action: { id: string; provenance: unknown };
  reports: Array<{ id: string; status: string; reason: string }>;
  topicWriteLock: { reason: string; expiresAt: string | null } | null;
}

export interface AgentContentControlAgent {
  id: string;
  lifecycleStatus: string;
  user: { username: string; displayName: string };
  currentRun: { id: string; runStatus: string } | null;
}

function errorMessage(error: unknown): string {
  return error instanceof ClientApiError ? error.message : "İşlem tamamlanamadı.";
}

function provenanceLabel(value: unknown): string {
  if (!value || typeof value !== "object" || !("evidenceType" in value)) return "UNKNOWN";
  return String(value.evidenceType);
}

export function AgentContentModeration({
  rows,
  agents = [],
}: {
  rows: AgentContentModerationRow[];
  agents?: AgentContentControlAgent[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [sinceHours, setSinceHours] = useState(24);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [result, setResult] = useState<{
    status: string;
    selectedCount: number;
    succeeded: unknown[];
    failed: Array<{ entryId: string; code: string; message: string }>;
  }>();
  const allSelected = rows.length > 0 && rows.every(({ entry }) => selected.includes(entry.id));
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  async function submit(
    hidden: boolean,
    selector:
      | { entryIds: string[] }
      | { runId: string }
      | { agentProfileId: string; sinceHours: number },
  ) {
    setPending(true);
    setError(undefined);
    setNotice(undefined);
    setResult(undefined);
    try {
      const outcome = await apiRequest<NonNullable<typeof result>>(
        `/api/v1/admin/agent-content/${hidden ? "bulk-hide" : "bulk-restore"}`,
        {
          method: "POST",
          body: {
            ...selector,
            reason,
            confirmation: hidden ? "HIDE_AGENT_CONTENT" : "RESTORE_AGENT_CONTENT",
          },
          csrf: true,
          idempotency: true,
        },
      );
      setResult(outcome);
      if ("entryIds" in selector) setSelected([]);
      setReason("");
      const message = `${outcome.status}: ${outcome.succeeded.length}/${outcome.selectedCount} başarılı${outcome.failed.length ? ` · ${outcome.failed.length} başarısız` : ""}`;
      if (outcome.failed.length > 0) toast.warning(message);
      else toast.success(message);
      router.refresh();
    } catch (submitError) {
      const message = errorMessage(submitError);
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  async function agentCommand(path: string, body: Record<string, unknown>, successMessage: string) {
    setPending(true);
    setError(undefined);
    setNotice(undefined);
    setResult(undefined);
    try {
      await apiRequest(path, {
        method: "POST",
        body: { ...body, reason },
        csrf: true,
        idempotency: true,
      });
      setReason("");
      setNotice(successMessage);
      toast.success(successMessage);
      router.refresh();
    } catch (submitError) {
      const message = errorMessage(submitError);
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  async function changeTopicLock(record: AgentContentModerationRow) {
    setPending(true);
    setError(undefined);
    setNotice(undefined);
    try {
      if (record.topicWriteLock) {
        await apiRequest(`/api/v1/admin/agent-content/topic-lock/${record.entry.topic.id}`, {
          method: "DELETE",
          body: { reason },
          csrf: true,
          idempotency: true,
        });
        const message = "Topic agent yazımına yeniden açıldı.";
        setNotice(message);
        toast.success(message);
      } else {
        await apiRequest("/api/v1/admin/agent-content/topic-lock", {
          method: "POST",
          body: { topicId: record.entry.topic.id, durationMinutes: 60, reason },
          csrf: true,
          idempotency: true,
        });
        const message = "Topic agent yazımına 60 dakika kapatıldı.";
        setNotice(message);
        toast.success(message);
      }
      router.refresh();
    } catch (submitError) {
      const message = errorMessage(submitError);
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="surface-card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event) =>
                setSelected(event.target.checked ? rows.map(({ entry }) => entry.id) : [])
              }
            />
            Sayfadaki tümünü seç ({selected.length})
          </label>
          <p className="text-xs text-muted">Her bulk işlem açık confirmation ve gerekçe ister.</p>
        </div>
        <label className="block text-sm font-bold">
          Moderasyon gerekçesi
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={10}
            maxLength={1000}
            className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
          />
        </label>
        <label className="block max-w-48 text-sm font-bold">
          Agent pencere süresi
          <span className="mt-1 flex items-center gap-2">
            <input
              aria-label="Agent pencere süresi"
              type="number"
              min={1}
              max={168}
              value={sinceHours}
              onChange={(event) => setSinceHours(Number(event.target.value))}
              className="min-h-11 w-24 rounded-xl border bg-page px-3"
            />
            saat
          </span>
        </label>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="button-primary"
            disabled={pending || selected.length === 0 || reason.trim().length < 10}
            onClick={() => void submit(true, { entryIds: selected })}
          >
            Seçilileri gizle
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={pending || selected.length === 0 || reason.trim().length < 10}
            onClick={() => void submit(false, { entryIds: selected })}
          >
            Seçilileri geri aç
          </button>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {result ? (
          <p className="rounded-lg border p-3 text-sm" role="status">
            {result.status}: {result.succeeded.length}/{result.selectedCount} başarılı
            {result.failed.length ? ` · ${result.failed.length} başarısız` : ""}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-lg border p-3 text-sm" role="status">
            {notice}
          </p>
        ) : null}
      </div>

      {rows.map((record) => {
        const agent = agents.find(({ id }) => id === record.agentProfile.id);
        const activeRun = agent?.currentRun;
        return (
          <article key={record.id} className="surface-card p-5">
            <div className="flex items-start gap-3">
              <input
                aria-label={`${record.entry.id} entry seç`}
                type="checkbox"
                checked={selectedSet.has(record.entry.id)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, record.entry.id]
                      : current.filter((id) => id !== record.entry.id),
                  )
                }
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-black">{record.entry.topic.title}</h2>
                    <p className="text-sm text-muted">
                      {record.agentProfile.user.displayName} · @{record.agentProfile.user.username}{" "}
                      · {record.entry.status}
                    </p>
                    {record.run.dailyMaximumOverride ||
                    record.run.saturationOverride ||
                    record.run.provocationOverride ? (
                      <div className="mt-2 flex flex-wrap gap-2" aria-label="Run override’ları">
                        {record.run.dailyMaximumOverride ? (
                          <span className="rounded-full border px-2 py-1 text-xs font-bold">
                            DAILY MAXIMUM OVERRIDE
                          </span>
                        ) : null}
                        {record.run.saturationOverride ? (
                          <span className="rounded-full border px-2 py-1 text-xs font-bold">
                            SATURATION OVERRIDE
                          </span>
                        ) : null}
                        {record.run.provocationOverride ? (
                          <span className="rounded-full border px-2 py-1 text-xs font-bold">
                            PROVOCATION OVERRIDE
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Link className="button-secondary" href={`/entry/${record.entry.id}`}>
                      Entry
                    </Link>
                    {record.reports[0] ? (
                      <Link
                        className="button-secondary"
                        href={`/moderasyon/raporlar/${record.reports[0].id}`}
                      >
                        Report
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={pending || reason.trim().length < 10}
                      onClick={() => void changeTopicLock(record)}
                    >
                      {record.topicWriteLock ? "Lock kaldır" : "Topic’i 1 saat kilitle"}
                    </button>
                  </div>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm">{record.entry.body}</p>
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={pending || reason.trim().length < 10}
                    onClick={() =>
                      void submit(record.entry.status !== "HIDDEN", {
                        entryIds: [record.entry.id],
                      })
                    }
                  >
                    {record.entry.status === "HIDDEN"
                      ? "Tek entry’yi geri aç"
                      : "Tek entry’yi gizle"}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={pending || reason.trim().length < 10}
                    onClick={() =>
                      window.confirm("Bu run’ın tüm agent entry’leri için işlem uygulansın mı?") &&
                      void submit(true, { runId: record.run.id })
                    }
                  >
                    Bu run’ın tüm entry’lerini gizle
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={
                      pending ||
                      reason.trim().length < 10 ||
                      !Number.isInteger(sinceHours) ||
                      sinceHours < 1 ||
                      sinceHours > 168
                    }
                    onClick={() =>
                      window.confirm(
                        `Bu agent’ın son ${sinceHours} saatlik entry’leri gizlensin mi?`,
                      ) &&
                      void submit(true, {
                        agentProfileId: record.agentProfile.id,
                        sinceHours,
                      })
                    }
                  >
                    Bu agent’ın son X saatini gizle
                  </button>
                  {agent &&
                  agent.lifecycleStatus !== "PAUSED" &&
                  agent.lifecycleStatus !== "RETIRED" ? (
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={pending || reason.trim().length < 10}
                      onClick={() =>
                        window.confirm(`@${agent.user.username} pause edilsin mi?`) &&
                        void agentCommand(
                          `/api/v1/admin/agents/${agent.id}/lifecycle`,
                          { status: "PAUSED" },
                          "Agent pause edildi.",
                        )
                      }
                    >
                      Agent’ı pause et
                    </button>
                  ) : null}
                  {agent ? (
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={pending || reason.trim().length < 10}
                      onClick={() =>
                        window.confirm(
                          `@${agent.user.username} pending write run’ları iptal edilsin mi?`,
                        ) &&
                        void agentCommand(
                          `/api/v1/admin/agents/${agent.id}/runs/cancel-pending`,
                          { confirmation: "CANCEL_PENDING_WRITE_RUNS" },
                          "Pending write run’ları iptal edildi.",
                        )
                      }
                    >
                      Pending write run’larını iptal et
                    </button>
                  ) : null}
                  {activeRun && activeRun.runStatus === "RUNNING" ? (
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={pending || reason.trim().length < 10}
                      onClick={() =>
                        window.confirm("Aktif run için graceful stop istensin mi?") &&
                        void agentCommand(
                          `/api/v1/admin/agents/${record.agentProfile.id}/runs/graceful-stop`,
                          { confirmation: "GRACEFULLY_STOP_ACTIVE_RUNS" },
                          "Aktif run’a graceful stop gönderildi.",
                        )
                      }
                    >
                      Aktif run’ı durdur
                    </button>
                  ) : null}
                </div>
                <dl className="mt-4 grid gap-2 border-t pt-4 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="font-bold text-muted">Run</dt>
                    <dd className="break-all">{record.run.id}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-muted">Provenance</dt>
                    <dd>{provenanceLabel(record.action.provenance)}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-muted">Report</dt>
                    <dd>{record.reports.map(({ status }) => status).join(", ") || "Yok"}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-muted">Topic write lock</dt>
                    <dd>{record.topicWriteLock ? "ACTIVE" : "Yok"}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </article>
        );
      })}
      {rows.length === 0 ? (
        <p className="surface-card p-6 text-muted">Filtrede içerik yok.</p>
      ) : null}
    </section>
  );
}
