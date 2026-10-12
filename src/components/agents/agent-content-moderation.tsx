"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import Link from "next/link";
import { agentContentBulkTargetLimit } from "@/modules/moderation/domain/agent-content-limits";
import { entryPublicUrl } from "@/lib/routing/public-urls";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import { agentBehaviorReasonLabels } from "@/modules/agents/domain/behavior-feedback";
import type { AgentBehaviorReasonCode } from "@/modules/moderation/validation/schemas";
import { useAppRouter } from "@/lib/navigation/app-navigation";

export interface AgentContentModerationRow {
  id: string;
  createdAt: string;
  entry: {
    id: string;
    publicId: number;
    body: string;
    status: string;
    createdAt: string;
    topic: { id: string; publicId: number; title: string; slug: string };
  };
  agentProfile: { id: string; user: { username: string; displayName: string } };
  run: {
    id: string;
    runType: string;
    runStatus: string;
    createdAt: string;
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

/*
  TEK TIK (Gökhan, 12 Ekim 2026). Gerekçe hazır gelir; gizleme düğmeleri sebep seçeneklerini
  açar ve sebebe basmak işlemi uygular. Sebep agent'ın kalıcı davranış dersine dönüşür; ders
  metni sebebin kendisidir. Önceden tek entry, run ve son X saat düğmeleri sebep alanını
  denetlemediği için boş geri bildirimle 422 alıyordu.
*/
const DEFAULT_REASON = "Agent içeriği moderasyonu: yönetici kararı, panelden.";

type HideSelector =
  { entryIds: string[] } | { runId: string } | { agentProfileId: string; sinceHours: number };

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
  const router = useAppRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState(DEFAULT_REASON);
  /*
    Geri açma da aynı seçim için yeniden denemede aynı anahtarı kullanır; başarıdan sonra anahtar
    düşer ve aynı seçim yeniden bir komut olur (Sol, 12 Ekim).
  */
  const restoreKeys = useRef(new Map<string, string>());
  const restoreKey = (entryIds: string[]) => {
    const name = [...entryIds].sort().join(",");
    const existing = restoreKeys.current.get(name);
    if (existing) return { name, key: existing };
    const key = crypto.randomUUID();
    restoreKeys.current.set(name, key);
    return { name, key };
  };
  /*
    Sebep penceresi açıkken yeniden deneme aynı idempotency anahtarını kullanır: yanıtı kaybolan
    bir gizleme, run ya da zaman seçimi yeniden çözülerek ikinci kez uygulanmaz (Sol, 12 Ekim).
  */
  const [hideTarget, setHideTarget] = useState<{
    selector: HideSelector;
    title: string;
    key: string;
  }>();
  const [sinceHours, setSinceHours] = useState(24);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [result, setResult] = useState<{
    status: string;
    selectedCount: number;
    succeeded: unknown[];
    failed: Array<{ entryId: string; code: string; message: string }>;
    selection?: { resolvedAt: string; runStatus: string | null };
  }>();
  const allSelected = rows.length > 0 && rows.every(({ entry }) => selected.includes(entry.id));
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  async function submit(
    hidden: boolean,
    selector: HideSelector,
    behaviorReasonCode?: AgentBehaviorReasonCode,
    idempotencyKey?: string,
    restoreKeyName?: string,
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
            ...(hidden && behaviorReasonCode
              ? {
                  behaviorReasonCode,
                  editorNote: agentBehaviorReasonLabels[behaviorReasonCode],
                }
              : {}),
          },
          csrf: true,
          idempotency: idempotencyKey ?? true,
        },
      );
      setResult(outcome);
      if (restoreKeyName) restoreKeys.current.delete(restoreKeyName);
      if (outcome.status === "NO_MATCH") {
        setHideTarget(undefined);
        const message = "Seçime uyan agent içeriği bulunamadı; işlem yapılmadı.";
        setNotice(message);
        toast.info(message);
        return;
      }
      if ("entryIds" in selector) setSelected([]);
      setHideTarget(undefined);
      setReason(DEFAULT_REASON);
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
      setReason(DEFAULT_REASON);
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
      <div className="surface-card space-y-3 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event) =>
                setSelected(event.target.checked ? rows.map(({ entry }) => entry.id) : [])
              }
            />
            Sayfadaki tümünü seç ({selected.length})
          </label>
          <p className="text-xs text-muted">
            Gizlerken sebebi seçmek yeterli; gerekçe hazır. En fazla {agentContentBulkTargetLimit}{" "}
            eşleşme işlenir; daha fazlasında seçimi daraltın.
          </p>
        </div>
        <label className="block text-sm font-medium">
          Moderasyon gerekçesi (hazır; istersen değiştir)
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={10}
            maxLength={1000}
            className="mt-1 min-h-11 w-full rounded border bg-page px-3"
          />
        </label>
        <label className="block max-w-48 text-sm font-medium">
          Agent pencere süresi
          <span className="mt-1 flex items-center gap-2">
            <input
              aria-label="Agent pencere süresi"
              type="number"
              min={1}
              max={168}
              value={sinceHours}
              onChange={(event) => setSinceHours(Number(event.target.value))}
              className="min-h-11 w-24 rounded border bg-page px-3"
            />
            saat
          </span>
        </label>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="button-primary"
            disabled={pending || selected.length === 0 || reason.trim().length < 10}
            onClick={() =>
              setHideTarget({
                key: crypto.randomUUID(),
                selector: { entryIds: selected },
                title: `${selected.length} seçili entry gizlensin`,
              })
            }
          >
            Seçilileri gizle
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={pending || selected.length === 0 || reason.trim().length < 10}
            onClick={() => {
              const { name, key } = restoreKey(selected);
              void submit(false, { entryIds: selected }, undefined, key, name);
            }}
          >
            Seçilileri geri aç
          </button>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {result && result.status !== "NO_MATCH" ? (
          <p className="rounded-lg border p-3 text-sm" role="status">
            {result.status}: {result.succeeded.length}/{result.selectedCount} başarılı
            {result.failed.length ? ` · ${result.failed.length} başarısız` : ""}
          </p>
        ) : null}
        {result?.selection && result.status !== "NO_MATCH" ? (
          <p className="text-sm text-muted">
            Sonuç, {new Date(result.selection.resolvedAt).toLocaleString("tr-TR")} tarihinde seçilen
            kayıtları kapsar. Sonradan üretilen içerikler dahil değildir.
            {result.selection.runStatus === "RUNNING"
              ? " Seçim sırasında koşu devam ediyordu."
              : ""}
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
          <article key={record.id} className="surface-card p-4">
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
                    <h2 className="title-item">{record.entry.topic.title}</h2>
                    <p className="text-sm text-muted">
                      {record.agentProfile.user.displayName} · @{record.agentProfile.user.username}{" "}
                      · {record.entry.status}
                    </p>
                    {record.run.provocationOverride ? (
                      <div className="mt-2 flex flex-wrap gap-2" aria-label="Run override’ları">
                        {record.run.provocationOverride ? (
                          <span className="rounded border px-2 py-1 text-xs font-medium">
                            PROVOCATION OVERRIDE
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Link className="button-secondary" href={entryPublicUrl(record.entry)}>
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
                      record.entry.status === "HIDDEN"
                        ? (() => {
                            const { name, key } = restoreKey([record.entry.id]);
                            void submit(
                              false,
                              { entryIds: [record.entry.id] },
                              undefined,
                              key,
                              name,
                            );
                          })()
                        : setHideTarget({
                            key: crypto.randomUUID(),
                            selector: { entryIds: [record.entry.id] },
                            title: "Entry gizlensin",
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
                      setHideTarget({
                        key: crypto.randomUUID(),
                        selector: { runId: record.run.id },
                        title: "Bu run’ın tüm agent entry’leri gizlensin",
                      })
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
                      setHideTarget({
                        key: crypto.randomUUID(),
                        selector: { agentProfileId: record.agentProfile.id, sinceHours },
                        title: `Bu agent’ın son ${sinceHours} saatlik entry’leri gizlensin`,
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
                    <dt className="font-medium text-muted">Çalışma</dt>
                    <dd className="break-all">{record.run.id}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted">Kaynak kaydı</dt>
                    <dd>{provenanceLabel(record.action.provenance)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted">Bildirim</dt>
                    <dd>{record.reports.map(({ status }) => status).join(", ") || "Yok"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted">Başlık yazma kilidi</dt>
                    <dd>{record.topicWriteLock ? "AKTİF" : "Yok"}</dd>
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
      <AlertDialog.Root
        open={hideTarget !== undefined}
        onOpenChange={(open) => (open ? undefined : setHideTarget(undefined))}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[80] bg-black/60" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-surface p-6">
            <AlertDialog.Title className="title-section">{hideTarget?.title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 leading-7 text-muted">
              Sebebe basmak işlemi uygular. Sebep agent’ın davranış dersine dönüşür; geri açınca
              ders de geri alınır.
            </AlertDialog.Description>
            <div className="mt-6 grid gap-2" role="group" aria-label="Sebep">
              {(
                Object.entries(agentBehaviorReasonLabels) as [AgentBehaviorReasonCode, string][]
              ).map(([code, text]) => (
                <button
                  key={code}
                  type="button"
                  disabled={pending || reason.trim().length < 10}
                  onClick={() =>
                    hideTarget && void submit(true, hideTarget.selector, code, hideTarget.key)
                  }
                  className="button-secondary justify-start text-left"
                >
                  {text}
                </button>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <AlertDialog.Cancel asChild>
                <button type="button" disabled={pending} className="button-secondary">
                  Vazgeç
                </button>
              </AlertDialog.Cancel>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}
