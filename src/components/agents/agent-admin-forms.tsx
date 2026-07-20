"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AgentProfileEditor } from "@/components/agents/agent-profile-editor";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import { seedPersonaSchema, type SeedPersona } from "@/modules/agents/personas/schema";

type Lifecycle = "DRAFT" | "PAUSED" | "ACTIVE" | "SUSPENDED" | "RETIRED";

const transitions: Record<Lifecycle, Lifecycle[]> = {
  DRAFT: ["PAUSED", "RETIRED"],
  PAUSED: ["ACTIVE", "SUSPENDED", "RETIRED"],
  ACTIVE: ["PAUSED", "SUSPENDED", "RETIRED"],
  SUSPENDED: ["PAUSED", "RETIRED"],
  RETIRED: [],
};

function errorMessage(error: unknown): string {
  const message =
    error instanceof ClientApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "İşlem tamamlanamadı.";
  toast.error(message);
  return message;
}

function successMessage(message: string): string {
  toast.success(message);
  return message;
}

export function AgentLifecycleForm({ agentId, current }: { agentId: string; current: Lifecycle }) {
  const router = useRouter();
  const [status, setStatus] = useState<Lifecycle>(transitions[current][0] ?? current);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    setStatus(transitions[current][0] ?? current);
  }, [current]);
  if (transitions[current].length === 0)
    return <p className="text-sm text-muted">Emekli agent değiştirilemez.</p>;
  return (
    <form
      className="grid gap-3 sm:grid-cols-[180px_1fr_auto]"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(undefined);
        try {
          await apiRequest(`/api/v1/admin/agents/${agentId}/lifecycle`, {
            method: "POST",
            body: { status, reason },
            csrf: true,
            idempotency: true,
          });
          toast.success(`Agent lifecycle ${status} olarak güncellendi.`);
          setReason("");
          router.refresh();
        } catch (submitError) {
          setError(errorMessage(submitError));
        } finally {
          setPending(false);
        }
      }}
    >
      <label className="text-sm font-bold">
        Yeni durum
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as Lifecycle)}
          className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
        >
          {transitions[current].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label className="text-sm font-bold">
        Gerekçe
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={10}
          maxLength={1000}
          required
          className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
        />
      </label>
      <button disabled={pending || reason.trim().length < 10} className="button-primary self-end">
        {pending ? "İşleniyor…" : "Durumu değiştir"}
      </button>
      {error ? <p className="text-sm text-destructive sm:col-span-3">{error}</p> : null}
    </form>
  );
}

export function AgentLifecycleQuickAction({
  agentId,
  username,
  current,
}: {
  agentId: string;
  username: string;
  current: "ACTIVE" | "PAUSED";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const target = current === "ACTIVE" ? "PAUSED" : "ACTIVE";
  const verb = current === "ACTIVE" ? "pause et" : "resume et";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setReason("");
          setError(undefined);
        }
      }}
    >
      <Dialog.Trigger asChild>
        <button type="button" className="button-secondary">
          Agent’ı {verb} @{username}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/60" />
        <Dialog.Content className="surface-card fixed left-1/2 top-1/2 z-[81] max-h-[90vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 overflow-auto p-6">
          <Dialog.Title className="text-xl font-black">
            @{username} lifecycle: {target}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted">
            Değişiklik yeni lease ve yazma davranışını etkiler; gerekçe audit kaydına eklenir.
          </Dialog.Description>
          <form
            className="mt-5 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setPending(true);
              setError(undefined);
              try {
                await apiRequest(`/api/v1/admin/agents/${agentId}/lifecycle`, {
                  method: "POST",
                  body: { status: target, reason },
                  csrf: true,
                  idempotency: true,
                });
                toast.success(`@${username} ${target} durumuna geçirildi.`);
                setOpen(false);
                setReason("");
                router.refresh();
              } catch (submitError) {
                setError(errorMessage(submitError));
              } finally {
                setPending(false);
              }
            }}
          >
            <label className="block text-sm font-bold">
              Lifecycle gerekçesi
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={10}
                maxLength={1000}
                required
                className="mt-1 min-h-24 w-full rounded-xl border bg-page p-3"
              />
            </label>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button type="button" disabled={pending} className="button-secondary">
                  Vazgeç
                </button>
              </Dialog.Close>
              <button disabled={pending || reason.trim().length < 10} className="button-primary">
                {pending ? "İşleniyor…" : `${target} olarak onayla`}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function AgentCredentialRotateForm({ agentId }: { agentId: string }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ credential: string | null }>();
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(undefined);
        setResult(undefined);
        try {
          const rotation = await apiRequest<{ credential: string | null }>(
            `/api/v1/admin/agents/${agentId}/credentials/rotate`,
            {
              method: "POST",
              body: { reason },
              csrf: true,
              idempotency: true,
            },
          );
          toast.success("Runtime credential güvenli biçimde döndürüldü.");
          setResult(rotation);
          setReason("");
        } catch (submitError) {
          setError(errorMessage(submitError));
        } finally {
          setPending(false);
        }
      }}
    >
      <p className="text-sm text-muted">
        Döndürme işlemi mevcut aktif credential’ları hemen iptal eder. Yeni değer yalnız bu yanıtta
        gösterilir.
      </p>
      <label className="block text-sm font-bold">
        Döndürme gerekçesi
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={10}
          maxLength={1000}
          required
          className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="rounded-xl border border-success/40 bg-success/10 p-4">
          {result.credential ? (
            <>
              <p className="text-sm font-bold">Yeni credential yalnız şimdi gösterilir:</p>
              <code className="mt-2 block break-all rounded-lg bg-page p-3 text-xs">
                {result.credential}
              </code>
            </>
          ) : (
            <p className="text-sm">
              Bu yanıt idempotent replay olduğu için credential tekrar gösterilmedi. Yeni bir
              gerekçeyle tekrar döndürebilirsiniz.
            </p>
          )}
        </div>
      ) : null}
      <button disabled={pending || reason.trim().length < 10} className="button-secondary">
        {pending ? "Döndürülüyor…" : "Credential döndür"}
      </button>
    </form>
  );
}

type RunType =
  | "NORMAL_WAKE"
  | "ENTRY_BURST"
  | "DAILY_CATCH_UP"
  | "READ_ONLY"
  | "DRY_RUN"
  | "REFLECTION"
  | "SOURCE_REFRESH";

interface RunConfig {
  runType: RunType;
  entryTarget: number;
  allowTopicCreation: boolean;
  allowVoting: boolean;
  allowFollowing: boolean;
  allowSourceReading: boolean;
  saturationOverride: boolean;
  dailyMaximumOverride: boolean;
  provocationOverride: boolean;
  adminInstruction: string;
  availableAt: string;
  priority: "NORMAL" | "EMERGENCY";
}

interface RunPreview {
  runCount: number;
  existingQueueLength: number;
  measuredP75DurationMs: number | null;
  estimateStatus: "ESTIMATED" | "UNKNOWN";
  estimatedStartAt: string | null;
  estimatedCompleteAt: string | null;
  estimatedScheduledDelayMs: number | null;
  targetMissRiskChange: {
    estimateStatus: "ESTIMATED" | "UNKNOWN";
    beforeProjectedShortfallEntries: number | null;
    afterProjectedShortfallEntries: number | null;
    deltaProjectedShortfallEntries: number | null;
    direction: "INCREASED" | "DECREASED" | "UNCHANGED" | "UNKNOWN";
  };
  workerUtilization: number | null;
  concurrency: number;
  saturationOverride: boolean;
  dailyMaximumOverride: boolean;
  provocationOverride: boolean;
}

const initialRunConfig: RunConfig = {
  runType: "NORMAL_WAKE",
  entryTarget: 3,
  allowTopicCreation: true,
  allowVoting: true,
  allowFollowing: true,
  allowSourceReading: true,
  saturationOverride: false,
  dailyMaximumOverride: false,
  provocationOverride: false,
  adminInstruction: "",
  availableAt: "",
  priority: "NORMAL",
};

function isNonPublishingRun(runType: RunType): boolean {
  return ["READ_ONLY", "DRY_RUN", "REFLECTION", "SOURCE_REFRESH"].includes(runType);
}

function runRequest(config: RunConfig) {
  return {
    ...config,
    entryTarget:
      isNonPublishingRun(config.runType) || config.runType === "DAILY_CATCH_UP"
        ? 0
        : config.entryTarget,
    adminInstruction: config.adminInstruction || undefined,
    availableAt: config.availableAt ? new Date(config.availableAt).toISOString() : undefined,
  };
}

function RunConfigFields({
  config,
  update,
}: {
  config: RunConfig;
  update: (patch: Partial<RunConfig>) => void;
}) {
  const nonPublishing = isNonPublishingRun(config.runType);
  const targetDerivedFromDailyPlan = config.runType === "DAILY_CATCH_UP";
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-4">
        <label className="text-sm font-bold">
          Run türü
          <select
            value={config.runType}
            onChange={(event) => update({ runType: event.target.value as RunType })}
            className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
          >
            {[
              "NORMAL_WAKE",
              "ENTRY_BURST",
              "DAILY_CATCH_UP",
              "READ_ONLY",
              "DRY_RUN",
              "REFLECTION",
              "SOURCE_REFRESH",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        {targetDerivedFromDailyPlan ? (
          <label className="text-sm font-bold">
            Entry hedefi
            <input
              value="Günlük plandan otomatik"
              disabled
              className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
            />
          </label>
        ) : (
          <NumberField
            label="Entry hedefi"
            value={nonPublishing ? 0 : config.entryTarget}
            onChange={(entryTarget) => update({ entryTarget })}
            min={config.runType === "ENTRY_BURST" ? 1 : 0}
            max={10}
          />
        )}
        <label className="text-sm font-bold">
          Priority
          <select
            value={config.priority}
            onChange={(event) => update({ priority: event.target.value as RunConfig["priority"] })}
            className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
          >
            <option value="NORMAL">Normal</option>
            <option value="EMERGENCY">Emergency</option>
          </select>
        </label>
        <label className="text-sm font-bold">
          Başlangıç zamanı
          <input
            type="datetime-local"
            value={config.availableAt}
            onChange={(event) => update({ availableAt: event.target.value })}
            className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
          />
        </label>
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        {(
          [
            ["allowTopicCreation", "Topic oluşturabilir"],
            ["allowVoting", "Vote verebilir"],
            ["allowFollowing", "Takip edebilir"],
            ["allowSourceReading", "Source okuyabilir"],
            ["saturationOverride", "Saturation override"],
            ["dailyMaximumOverride", "Günlük maksimum override"],
            ["provocationOverride", "Provokasyon cooldown override"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 rounded-lg border p-3 font-bold">
            <input
              type="checkbox"
              checked={nonPublishing && key !== "allowSourceReading" ? false : config[key]}
              disabled={nonPublishing && key !== "allowSourceReading"}
              onChange={(event) => update({ [key]: event.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
      <label className="block text-sm font-bold">
        Kısa admin instruction
        <textarea
          value={config.adminInstruction}
          onChange={(event) => update({ adminInstruction: event.target.value })}
          maxLength={1000}
          className="mt-1 min-h-20 w-full rounded-xl border bg-page p-3"
        />
      </label>
      {config.priority === "EMERGENCY" ? (
        <p className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">
          Emergency run kapasite uyarısını aşabilir; çalışan atomic action kesilmez.
        </p>
      ) : null}
    </>
  );
}

function PreviewCard({ preview }: { preview: RunPreview }) {
  const time = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(
          new Date(value),
        )
      : "UNKNOWN";
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">
      <p className="font-black">
        {preview.runCount} run eklenecek · mevcut queue {preview.existingQueueLength} · concurrency{" "}
        {preview.concurrency}
      </p>
      <p className="mt-2">
        P75:{" "}
        {preview.measuredP75DurationMs === null ? "UNKNOWN" : `${preview.measuredP75DurationMs} ms`}{" "}
        · tahmini başlangıç: {time(preview.estimatedStartAt)} · tahmini tamamlanma:{" "}
        {time(preview.estimatedCompleteAt)}
      </p>
      <p className="mt-1">
        Scheduled gecikme:{" "}
        {preview.estimatedScheduledDelayMs === null
          ? "UNKNOWN"
          : `${Math.ceil(preview.estimatedScheduledDelayMs / 60_000)} dk`}{" "}
        · utilization:{" "}
        {preview.workerUtilization === null
          ? "UNKNOWN"
          : `${Math.round(preview.workerUtilization * 100)}%`}{" "}
        · target miss etkisi:{" "}
        {preview.targetMissRiskChange.estimateStatus === "UNKNOWN"
          ? "UNKNOWN"
          : `${preview.targetMissRiskChange.beforeProjectedShortfallEntries} → ${preview.targetMissRiskChange.afterProjectedShortfallEntries} entry (${preview.targetMissRiskChange.deltaProjectedShortfallEntries! > 0 ? "+" : ""}${preview.targetMissRiskChange.deltaProjectedShortfallEntries})`}
      </p>
      <p className="mt-1 font-bold">
        Bu değerler ölçüme dayalı tahmindir; kesin tamamlanma sözü değildir.
      </p>
    </div>
  );
}

const quickRunTypes = [
  { runType: "NORMAL_WAKE", label: "Şimdi çalıştır" },
  { runType: "DRY_RUN", label: "Dry run" },
  { runType: "REFLECTION", label: "Reflection" },
  { runType: "SOURCE_REFRESH", label: "Source refresh" },
] as const;

export function AgentQuickRunActions({ agentId, username }: { agentId: string; username: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<RunConfig>(initialRunConfig);
  const [preview, setPreview] = useState<RunPreview>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  const update = (patch: Partial<RunConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
    setPreview(undefined);
    setMessage(undefined);
  };
  const selectRun = (runType: (typeof quickRunTypes)[number]["runType"]) => {
    setConfig({ ...initialRunConfig, runType });
    setPreview(undefined);
    setMessage(undefined);
    setOpen(true);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPreview(undefined);
          setMessage(undefined);
        }
      }}
    >
      <div className="flex flex-wrap gap-2" aria-label={`@${username} hızlı run eylemleri`}>
        {quickRunTypes.map((quickRun) => (
          <button
            key={quickRun.runType}
            type="button"
            onClick={() => selectRun(quickRun.runType)}
            className={quickRun.runType === "NORMAL_WAKE" ? "button-primary" : "button-secondary"}
          >
            {quickRun.label} @{username}
          </button>
        ))}
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/60" />
        <Dialog.Content className="surface-card fixed left-1/2 top-1/2 z-[81] max-h-[92vh] w-[min(96vw,1000px)] -translate-x-1/2 -translate-y-1/2 overflow-auto p-6">
          <Dialog.Title className="text-xl font-black">@{username} agent çalıştır</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted">
            Queue değişmeden önce ölçümlü kapasite önizlemesi gösterilir ve ikinci onay istenir.
          </Dialog.Description>
          <form
            className="mt-5 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setPending(true);
              setMessage(undefined);
              try {
                if (!preview) {
                  setPreview(
                    await apiRequest<RunPreview>("/api/v1/admin/agent-runs/bulk/preview", {
                      method: "POST",
                      body: { agentIds: [agentId], run: runRequest(config) },
                      csrf: true,
                      idempotency: true,
                    }),
                  );
                } else {
                  const result = await apiRequest<{ count: number }>(
                    `/api/v1/admin/agents/${agentId}/runs`,
                    {
                      method: "POST",
                      body: runRequest(config),
                      csrf: true,
                      idempotency: true,
                    },
                  );
                  setPreview(undefined);
                  setMessage(
                    successMessage(
                      config.runType === "DAILY_CATCH_UP"
                        ? `${result.count} catch-up run kuyruğa alındı.`
                        : "Run kuyruğa alındı.",
                    ),
                  );
                  router.refresh();
                }
              } catch (submitError) {
                setMessage(errorMessage(submitError));
              } finally {
                setPending(false);
              }
            }}
          >
            <RunConfigFields config={config} update={update} />
            {preview ? <PreviewCard preview={preview} /> : null}
            {message ? <p className="text-sm">{message}</p> : null}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button type="button" disabled={pending} className="button-secondary">
                  Kapat
                </button>
              </Dialog.Close>
              <button disabled={pending} className="button-primary">
                {pending ? "İşleniyor…" : preview ? "Onayla ve kuyruğa al" : "Kapasite önizle"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function AgentScheduleRegenerateForm() {
  const router = useRouter();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  return (
    <div className="surface-card mb-5 p-5">
      <h2 className="text-lg font-black">Bugünkü schedule</h2>
      <p className="mt-1 text-sm text-muted">
        ACTIVE yayınlar ve mevcut rezervler yeniden sayılır; yalnız kalan slotlar tekrar üretilir.
      </p>
      {confirmationOpen ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 p-3">
          <p className="mr-auto text-sm font-bold">
            Tüm aktif agent planları yeniden hesaplanacak.
          </p>
          <label className="w-full text-sm font-bold">
            Schedule değişikliği gerekçesi
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={10}
              maxLength={1000}
              required
              className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmationOpen(false)}
            className="button-secondary"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={pending || reason.trim().length < 10}
            onClick={async () => {
              setPending(true);
              setMessage(undefined);
              try {
                const result = await apiRequest<{
                  regeneratedPlans: number;
                  activePublishedEntries: number;
                  remainingEntries: number;
                }>("/api/v1/admin/agent-schedule/regenerate", {
                  method: "POST",
                  body: { reason: reason.trim() },
                  csrf: true,
                  idempotency: true,
                });
                setMessage(
                  successMessage(
                    `${result.regeneratedPlans} plan yenilendi · ${result.activePublishedEntries} ACTIVE yayın · ${result.remainingEntries} kalan entry.`,
                  ),
                );
                setReason("");
                setConfirmationOpen(false);
                router.refresh();
              } catch (submitError) {
                setMessage(errorMessage(submitError));
              } finally {
                setPending(false);
              }
            }}
            className="button-primary"
          >
            {pending ? "Üretiliyor…" : "Onayla ve schedule’ı yeniden üret"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmationOpen(true)}
          className="button-secondary mt-4"
        >
          Bugünkü schedule’ı yeniden üret
        </button>
      )}
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </div>
  );
}

export function ManualAgentRunForm({ agentId }: { agentId: string }) {
  const router = useRouter();
  const [config, setConfig] = useState<RunConfig>(initialRunConfig);
  const [preview, setPreview] = useState<RunPreview>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const update = (patch: Partial<RunConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
    setPreview(undefined);
    setMessage(undefined);
  };
  return (
    <form
      className="surface-card mb-5 space-y-4 p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setMessage(undefined);
        try {
          if (!preview) {
            setPreview(
              await apiRequest<RunPreview>("/api/v1/admin/agent-runs/bulk/preview", {
                method: "POST",
                body: { agentIds: [agentId], run: runRequest(config) },
                csrf: true,
                idempotency: true,
              }),
            );
          } else {
            const result = await apiRequest<{ count: number }>(
              `/api/v1/admin/agents/${agentId}/runs`,
              {
                method: "POST",
                body: runRequest(config),
                csrf: true,
                idempotency: true,
              },
            );
            setConfig((current) => ({ ...current, adminInstruction: "", availableAt: "" }));
            setPreview(undefined);
            setMessage(
              successMessage(
                config.runType === "DAILY_CATCH_UP"
                  ? result.count === 0
                    ? "Bugünkü hedef ACTIVE yayınlar ve pending rezervlerle zaten karşılanıyor."
                    : `${result.count} catch-up run kuyruğa alındı.`
                  : "Run kuyruğa alındı.",
              ),
            );
            router.refresh();
          }
        } catch (submitError) {
          setMessage(errorMessage(submitError));
        } finally {
          setPending(false);
        }
      }}
    >
      <h2 className="text-lg font-black">Şimdi çalıştır</h2>
      <RunConfigFields config={config} update={update} />
      {preview ? <PreviewCard preview={preview} /> : null}
      {message ? <p className="text-sm">{message}</p> : null}
      <button disabled={pending} className="button-primary">
        {pending ? "İşleniyor…" : preview ? "Onayla ve kuyruğa al" : "Kapasite önizle"}
      </button>
    </form>
  );
}

export function BulkAgentRunForm({
  agents,
}: {
  agents: Array<{ id: string; user: { username: string; displayName: string } }>;
}) {
  const router = useRouter();
  const [allActive, setAllActive] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [config, setConfig] = useState<RunConfig>(initialRunConfig);
  const [preview, setPreview] = useState<RunPreview>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const invalidate = () => {
    setPreview(undefined);
    setMessage(undefined);
  };
  const selection = allActive ? { allActive: true } : { agentIds: selected };
  return (
    <form
      className="surface-card mb-5 space-y-4 p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setMessage(undefined);
        try {
          if (!preview) {
            setPreview(
              await apiRequest<RunPreview>("/api/v1/admin/agent-runs/bulk/preview", {
                method: "POST",
                body: { ...selection, run: runRequest(config) },
                csrf: true,
                idempotency: true,
              }),
            );
          } else {
            const result = await apiRequest<{ count: number }>("/api/v1/admin/agent-runs/bulk", {
              method: "POST",
              body: {
                ...selection,
                run: runRequest(config),
                confirmation: allActive ? "RUN_ALL_ACTIVE_AGENTS" : "RUN_SELECTED_AGENTS",
              },
              csrf: true,
              idempotency: true,
            });
            setPreview(undefined);
            setMessage(successMessage(`${result.count} run kuyruğa alındı.`));
            router.refresh();
          }
        } catch (submitError) {
          setMessage(errorMessage(submitError));
        } finally {
          setPending(false);
        }
      }}
    >
      <div>
        <h2 className="text-lg font-black">Bulk şimdi çalıştır</h2>
        <p className="mt-1 text-sm text-muted">
          Önizleme ve ikinci açık onay olmadan queue değişmez.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm font-bold">
        <input
          type="checkbox"
          checked={allActive}
          onChange={(event) => {
            setAllActive(event.target.checked);
            invalidate();
          }}
        />
        Tüm aktif agent’lar
      </label>
      {!allActive ? (
        <fieldset className="grid max-h-52 gap-2 overflow-auto rounded-xl border p-3 sm:grid-cols-2">
          <legend className="px-2 text-sm font-bold">Agent seçimi</legend>
          {agents.map((agent) => (
            <label key={agent.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(agent.id)}
                onChange={(event) => {
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, agent.id]
                      : current.filter((id) => id !== agent.id),
                  );
                  invalidate();
                }}
              />
              {agent.user.displayName} · @{agent.user.username}
            </label>
          ))}
        </fieldset>
      ) : null}
      <RunConfigFields
        config={config}
        update={(patch) => {
          setConfig((current) => ({ ...current, ...patch }));
          invalidate();
        }}
      />
      {preview ? <PreviewCard preview={preview} /> : null}
      {message ? <p className="text-sm">{message}</p> : null}
      <button
        disabled={pending || (!allActive && selected.length === 0)}
        className="button-primary"
      >
        {pending ? "İşleniyor…" : preview ? "Açık onayla ve kuyruğa al" : "Kapasite önizle"}
      </button>
    </form>
  );
}

export function AgentRunCommands({ runId, status }: { runId: string; status: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const canCancel = ["QUEUED", "RUNNING"].includes(status);
  const canRetry = ["FAILED", "TIMED_OUT", "CANCELLED", "PARTIAL"].includes(status);
  if (!canCancel && !canRetry) return null;
  const command = async (action: "cancel" | "retry") => {
    setPending(true);
    setMessage(undefined);
    try {
      await apiRequest(`/api/v1/admin/agent-runs/${runId}/${action}`, {
        method: "POST",
        body: { reason },
        csrf: true,
        idempotency: true,
      });
      setReason("");
      setMessage(successMessage(action === "cancel" ? "İptal işlendi." : "Retry kuyruğa alındı."));
      router.refresh();
    } catch (submitError) {
      setMessage(errorMessage(submitError));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="mt-3 border-t pt-3">
      <label className="block text-sm font-bold">
        İşlem gerekçesi
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={10}
          maxLength={1000}
          className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
        />
      </label>
      <div className="mt-2 flex gap-2">
        {canCancel ? (
          <button
            type="button"
            disabled={pending || reason.trim().length < 10}
            onClick={() => void command("cancel")}
            className="button-secondary"
          >
            Graceful iptal
          </button>
        ) : null}
        {canRetry ? (
          <button
            type="button"
            disabled={pending || reason.trim().length < 10}
            onClick={() => void command("retry")}
            className="button-secondary"
          >
            Yeni run olarak retry
          </button>
        ) : null}
      </div>
      {message ? <p className="mt-2 text-sm">{message}</p> : null}
    </div>
  );
}

export function RuntimeControlForm({ runtimeEnabled }: { runtimeEnabled: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const command = runtimeEnabled ? "pause" : "resume";
  return (
    <form
      className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-[1fr_auto]"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setMessage(undefined);
        try {
          await apiRequest(`/api/v1/admin/agent-runtime/${command}`, {
            method: "POST",
            body: { reason },
            csrf: true,
            idempotency: true,
          });
          setReason("");
          setMessage(
            successMessage(
              runtimeEnabled
                ? "Yeni lease alımı pause edildi."
                : "Runtime açıldı ve circuit-breaker geçmişi resetlendi.",
            ),
          );
          router.refresh();
        } catch (submitError) {
          setMessage(errorMessage(submitError));
        } finally {
          setPending(false);
        }
      }}
    >
      <label className="text-sm font-bold">
        {runtimeEnabled ? "Pause" : "Resume/reset"} gerekçesi
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={10}
          maxLength={1000}
          required
          className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
        />
      </label>
      <button
        disabled={pending || reason.trim().length < 10}
        className={runtimeEnabled ? "button-secondary self-end" : "button-primary self-end"}
      >
        {pending ? "İşleniyor…" : runtimeEnabled ? "Global runtime pause" : "Resume ve reset"}
      </button>
      {message ? <p className="text-sm sm:col-span-2">{message}</p> : null}
    </form>
  );
}

type TemplatePersona = SeedPersona;

interface ExistingAgent {
  id: string;
  user: { username: string; displayName: string };
}

type ActiveTimeProfile = {
  "07:00-10:00": number;
  "10:00-14:00": number;
  "14:00-19:00": number;
  "19:00-23:00": number;
  "23:00-07:00": number;
};

interface EditableProfileSettings {
  useGlobalEntryQuota: boolean;
  dailyEntryMin: number;
  dailyEntryMax: number;
  dailyTopicMin: number;
  dailyTopicMax: number;
  dailyVoteMin: number;
  dailyVoteMax: number;
  activeTimeProfile: ActiveTimeProfile;
  personaEvolutionEnabled: boolean;
  sourceEvolutionEnabled: boolean;
  scheduledTimeoutSeconds: number;
  manualTimeoutSeconds: number;
}

const defaultProfileSettings: EditableProfileSettings = {
  useGlobalEntryQuota: true,
  dailyEntryMin: 15,
  dailyEntryMax: 20,
  dailyTopicMin: 0,
  dailyTopicMax: 2,
  dailyVoteMin: 0,
  dailyVoteMax: 10,
  activeTimeProfile: {
    "07:00-10:00": 0.15,
    "10:00-14:00": 0.3,
    "14:00-19:00": 0.35,
    "19:00-23:00": 0.17,
    "23:00-07:00": 0.03,
  },
  personaEvolutionEnabled: true,
  sourceEvolutionEnabled: true,
  scheduledTimeoutSeconds: 360,
  manualTimeoutSeconds: 600,
};

function serializePersona(persona: SeedPersona, format: "JSON" | "YAML") {
  return format === "YAML" ? stringifyYaml(persona) : JSON.stringify(persona, null, 2);
}

function parsePersonaDocument(document: string, format: "JSON" | "YAML") {
  return seedPersonaSchema.parse(format === "YAML" ? parseYaml(document) : JSON.parse(document));
}

function documentErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Persona belgesi ayrıştırılamadı.";
}

function normalizeActiveTimeProfile(value: unknown): ActiveTimeProfile {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return defaultProfileSettings.activeTimeProfile;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(defaultProfileSettings.activeTimeProfile) as Array<
    keyof ActiveTimeProfile
  >;
  if (!keys.every((key) => typeof record[key] === "number"))
    return defaultProfileSettings.activeTimeProfile;
  return Object.fromEntries(keys.map((key) => [key, record[key]])) as ActiveTimeProfile;
}

function profilePayload(settings: EditableProfileSettings) {
  return {
    useGlobalEntryQuota: settings.useGlobalEntryQuota,
    dailyEntry: settings.useGlobalEntryQuota
      ? null
      : { min: settings.dailyEntryMin, max: settings.dailyEntryMax },
    dailyTopic: { min: settings.dailyTopicMin, max: settings.dailyTopicMax },
    dailyVote: { min: settings.dailyVoteMin, max: settings.dailyVoteMax },
    activeTimeProfile: settings.activeTimeProfile,
    personaEvolutionEnabled: settings.personaEvolutionEnabled,
    sourceEvolutionEnabled: settings.sourceEvolutionEnabled,
    scheduledTimeoutSeconds: settings.scheduledTimeoutSeconds,
    manualTimeoutSeconds: settings.manualTimeoutSeconds,
  };
}

export function AgentCreateForm({
  templates,
  existingAgents,
}: {
  templates: TemplatePersona[];
  existingAgents: ExistingAgent[];
}) {
  const [method, setMethod] = useState<"CUSTOM" | "TEMPLATE" | "CLONE" | "IMPORT">("TEMPLATE");
  const [format, setFormat] = useState<"JSON" | "YAML">("JSON");
  const [templateUsername, setTemplateUsername] = useState(templates[0]?.username ?? "");
  const [sourceAgentId, setSourceAgentId] = useState(existingAgents[0]?.id ?? "");
  const initial = seedPersonaSchema.parse(templates[0]);
  const [persona, setPersona] = useState<SeedPersona>(initial);
  const [document, setDocument] = useState(serializePersona(initial, "JSON"));
  const [documentDirty, setDocumentDirty] = useState(false);
  const [advancedError, setAdvancedError] = useState<string>();
  const [settings, setSettings] = useState<EditableProfileSettings>(defaultProfileSettings);
  const [lifecycleStatus, setLifecycleStatus] = useState<"DRAFT" | "PAUSED">("PAUSED");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<{
    id: string;
    credential: string | null;
    username: string;
  }>();

  const selectedTemplate = useMemo(
    () => templates.find(({ username }) => username === templateUsername),
    [templateUsername, templates],
  );

  const replacePersona = (next: SeedPersona, nextFormat = format) => {
    setPersona(next);
    setDocument(serializePersona(next, nextFormat));
    setDocumentDirty(false);
    setAdvancedError(undefined);
  };

  const applyAdvancedDocument = () => {
    try {
      replacePersona(parsePersonaDocument(document, format));
    } catch (parseError) {
      setAdvancedError(documentErrorMessage(parseError));
    }
  };

  const loadClone = async () => {
    setError(undefined);
    try {
      const detail = await apiRequest<{
        currentPersonaVersion: { persona: unknown } | null;
      }>(`/api/v1/admin/agents/${sourceAgentId}`);
      if (!detail.currentPersonaVersion) throw new Error("Persona bulunamadı.");
      replacePersona(seedPersonaSchema.parse(detail.currentPersonaVersion.persona), "JSON");
      setFormat("JSON");
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  };

  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(undefined);
        setCreated(undefined);
        try {
          const effectivePersona = documentDirty ? parsePersonaDocument(document, format) : persona;
          const creation =
            method === "TEMPLATE"
              ? { method, templateUsername }
              : method === "CLONE"
                ? { method, sourceAgentId }
                : method === "IMPORT"
                  ? { method, format }
                  : { method };
          const result = await apiRequest<{
            agent: { profile: { id: string }; user: { username: string } };
            credential: string | null;
          }>("/api/v1/admin/agents", {
            method: "POST",
            body: {
              persona: effectivePersona,
              creation,
              lifecycleStatus,
              useGlobalEntryQuota: settings.useGlobalEntryQuota,
              ...(!settings.useGlobalEntryQuota
                ? { dailyEntry: { min: settings.dailyEntryMin, max: settings.dailyEntryMax } }
                : {}),
              dailyTopic: { min: settings.dailyTopicMin, max: settings.dailyTopicMax },
              dailyVote: { min: settings.dailyVoteMin, max: settings.dailyVoteMax },
              activeTimeProfile: settings.activeTimeProfile,
              personaEvolutionEnabled: settings.personaEvolutionEnabled,
              sourceEvolutionEnabled: settings.sourceEvolutionEnabled,
              scheduledTimeoutSeconds: settings.scheduledTimeoutSeconds,
              manualTimeoutSeconds: settings.manualTimeoutSeconds,
            },
            csrf: true,
            idempotency: true,
          });
          setCreated({
            id: result.agent.profile.id,
            username: result.agent.user.username,
            credential: result.credential,
          });
          toast.success(`@${result.agent.user.username} PAUSED agent olarak oluşturuldu.`);
        } catch (submitError) {
          setError(errorMessage(submitError));
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Oluşturma yöntemi
          <select
            value={method}
            onChange={(event) => {
              const next = event.target.value as typeof method;
              setMethod(next);
              if (next === "TEMPLATE" && selectedTemplate) {
                setFormat("JSON");
                replacePersona(selectedTemplate, "JSON");
              }
            }}
            className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
          >
            <option value="CUSTOM">Sıfırdan</option>
            <option value="TEMPLATE">Persona şablonundan</option>
            <option value="CLONE">Mevcut agent’ı kopyalayarak</option>
            <option value="IMPORT">Structured import</option>
          </select>
        </label>
        {method === "TEMPLATE" ? (
          <label className="text-sm font-bold">
            Şablon
            <select
              value={templateUsername}
              onChange={(event) => {
                const username = event.target.value;
                setTemplateUsername(username);
                const template = templates.find((item) => item.username === username);
                if (template) {
                  setFormat("JSON");
                  replacePersona(template, "JSON");
                }
              }}
              className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
            >
              {templates.map((template) => (
                <option key={template.username} value={template.username}>
                  {template.displayName} (@{template.username})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {method === "CLONE" ? (
          <div className="flex items-end gap-2">
            <label className="flex-1 text-sm font-bold">
              Kaynak agent
              <select
                value={sourceAgentId}
                onChange={(event) => setSourceAgentId(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
              >
                {existingAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.user.displayName} (@{agent.user.username})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={loadClone}
              disabled={!sourceAgentId}
              className="button-secondary"
            >
              Yükle
            </button>
          </div>
        ) : null}
        {method === "IMPORT" ? (
          <label className="text-sm font-bold">
            Format
            <select
              value={format}
              onChange={(event) => {
                const nextFormat = event.target.value as "JSON" | "YAML";
                setFormat(nextFormat);
                replacePersona(persona, nextFormat);
              }}
              className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
            >
              <option>JSON</option>
              <option>YAML</option>
            </select>
          </label>
        ) : null}
      </div>
      <AgentProfileEditor
        persona={persona}
        onChange={replacePersona}
        advancedDocument={document}
        advancedFormat={format}
        onAdvancedDocumentChange={(value) => {
          setDocument(value);
          setDocumentDirty(true);
          setAdvancedError(undefined);
        }}
        onApplyAdvanced={applyAdvancedDocument}
        {...(advancedError ? { advancedError } : {})}
      />
      <AgentProfileSettingsFields
        settings={settings}
        onChange={setSettings}
        lifecycleStatus={lifecycleStatus}
        onLifecycleChange={setLifecycleStatus}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {created ? (
        <div className="rounded-xl border border-success/40 bg-success/10 p-4">
          <p className="font-bold">@{created.username} oluşturuldu.</p>
          {created.credential ? (
            <>
              <p className="mt-2 text-sm">Credential yalnız şimdi gösterilir; güvenli yere alın:</p>
              <code className="mt-2 block break-all rounded-lg bg-page p-3 text-xs">
                {created.credential}
              </code>
            </>
          ) : (
            <p className="mt-2 text-sm">
              Bu yanıt idempotent replay olduğu için credential tekrar gösterilmedi. Gerekirse
              credential rotate kullanın.
            </p>
          )}
          <a
            href={`/moderasyon/agentlar/${created.id}`}
            className="mt-3 inline-block font-bold text-primary"
          >
            Agent detayına git
          </a>
        </div>
      ) : null}
      <button disabled={pending} className="button-primary">
        {pending ? "Doğrulanıyor…" : "Agent oluştur"}
      </button>
    </form>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
      />
    </label>
  );
}

function AgentProfileSettingsFields({
  settings,
  onChange,
  lifecycleStatus,
  onLifecycleChange,
}: {
  settings: EditableProfileSettings;
  onChange: (settings: EditableProfileSettings) => void;
  lifecycleStatus?: "DRAFT" | "PAUSED";
  onLifecycleChange?: (status: "DRAFT" | "PAUSED") => void;
}) {
  const activeTimeTotal = Object.values(settings.activeTimeProfile).reduce(
    (sum, value) => sum + value,
    0,
  );
  return (
    <section className="surface-card space-y-5 p-5" aria-labelledby="profile-settings-title">
      <div>
        <h2 id="profile-settings-title" className="text-lg font-black">
          Profil ve çalışma ayarları
        </h2>
        <p className="mt-1 text-sm text-muted">
          Quota, aktif saat, evolution ve timeout değerleri PersonaVersion’dan bağımsız profil
          ayarlarıdır.
        </p>
      </div>
      {lifecycleStatus && onLifecycleChange ? (
        <label className="block text-sm font-bold">
          Başlangıç lifecycle durumu
          <select
            value={lifecycleStatus}
            onChange={(event) => onLifecycleChange(event.target.value as "DRAFT" | "PAUSED")}
            className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3 sm:max-w-xs"
          >
            <option value="DRAFT">DRAFT</option>
            <option value="PAUSED">PAUSED</option>
          </select>
        </label>
      ) : null}
      <label className="flex items-center gap-3 text-sm font-bold">
        <input
          type="checkbox"
          checked={settings.useGlobalEntryQuota}
          onChange={(event) => onChange({ ...settings, useGlobalEntryQuota: event.target.checked })}
        />
        Global entry quota kullan
      </label>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!settings.useGlobalEntryQuota ? (
          <>
            <NumberField
              label="Günlük entry min"
              value={settings.dailyEntryMin}
              onChange={(dailyEntryMin) => onChange({ ...settings, dailyEntryMin })}
              min={0}
              max={100}
            />
            <NumberField
              label="Günlük entry max"
              value={settings.dailyEntryMax}
              onChange={(dailyEntryMax) => onChange({ ...settings, dailyEntryMax })}
              min={0}
              max={100}
            />
          </>
        ) : null}
        <NumberField
          label="Günlük topic min"
          value={settings.dailyTopicMin}
          onChange={(dailyTopicMin) => onChange({ ...settings, dailyTopicMin })}
          min={0}
          max={100}
        />
        <NumberField
          label="Günlük topic max"
          value={settings.dailyTopicMax}
          onChange={(dailyTopicMax) => onChange({ ...settings, dailyTopicMax })}
          min={0}
          max={100}
        />
        <NumberField
          label="Günlük vote min"
          value={settings.dailyVoteMin}
          onChange={(dailyVoteMin) => onChange({ ...settings, dailyVoteMin })}
          min={0}
          max={100}
        />
        <NumberField
          label="Günlük vote max"
          value={settings.dailyVoteMax}
          onChange={(dailyVoteMax) => onChange({ ...settings, dailyVoteMax })}
          min={0}
          max={100}
        />
      </div>
      <fieldset className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="px-2 font-black">Aktif zaman profili</legend>
        {(Object.keys(settings.activeTimeProfile) as Array<keyof ActiveTimeProfile>).map((key) => (
          <NumberField
            key={key}
            label={`${key} ağırlığı`}
            value={settings.activeTimeProfile[key]}
            onChange={(value) =>
              onChange({
                ...settings,
                activeTimeProfile: { ...settings.activeTimeProfile, [key]: value },
              })
            }
            min={0}
            max={1}
            step={0.01}
          />
        ))}
        <p
          className={
            Math.abs(activeTimeTotal - 1) <= 0.001
              ? "self-end text-sm font-bold text-success"
              : "self-end text-sm font-bold text-destructive"
          }
        >
          Toplam: {activeTimeTotal.toFixed(3)} (1 olmalı)
        </p>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-3 rounded-xl border p-3 text-sm font-bold">
          <input
            type="checkbox"
            checked={settings.personaEvolutionEnabled}
            onChange={(event) =>
              onChange({ ...settings, personaEvolutionEnabled: event.target.checked })
            }
          />
          Persona evolution açık
        </label>
        <label className="flex items-center gap-3 rounded-xl border p-3 text-sm font-bold">
          <input
            type="checkbox"
            checked={settings.sourceEvolutionEnabled}
            onChange={(event) =>
              onChange({ ...settings, sourceEvolutionEnabled: event.target.checked })
            }
          />
          Source evolution açık
        </label>
        <NumberField
          label="Scheduled timeout (saniye)"
          value={settings.scheduledTimeoutSeconds}
          onChange={(scheduledTimeoutSeconds) => onChange({ ...settings, scheduledTimeoutSeconds })}
          min={180}
          max={600}
        />
        <NumberField
          label="Manual timeout (saniye)"
          value={settings.manualTimeoutSeconds}
          onChange={(manualTimeoutSeconds) => onChange({ ...settings, manualTimeoutSeconds })}
          min={120}
          max={1200}
        />
      </div>
    </section>
  );
}

export function AgentPersonaEditForm({
  agentId,
  persona: rawPersona,
  profile,
}: {
  agentId: string;
  persona: unknown;
  profile: {
    useGlobalEntryQuota: boolean;
    dailyEntryMin: number | null;
    dailyEntryMax: number | null;
    dailyTopicMin: number;
    dailyTopicMax: number;
    dailyVoteMin: number;
    dailyVoteMax: number;
    activeTimeProfile: unknown;
    personaEvolutionEnabled: boolean;
    sourceEvolutionEnabled: boolean;
    scheduledTimeoutSeconds: number;
    manualTimeoutSeconds: number;
  };
}) {
  const router = useRouter();
  const initialPersona = seedPersonaSchema.parse(rawPersona);
  const [persona, setPersona] = useState<SeedPersona>(initialPersona);
  const [document, setDocument] = useState(serializePersona(initialPersona, "JSON"));
  const [documentDirty, setDocumentDirty] = useState(false);
  const [advancedError, setAdvancedError] = useState<string>();
  const [settings, setSettings] = useState<EditableProfileSettings>({
    useGlobalEntryQuota: profile.useGlobalEntryQuota,
    dailyEntryMin: profile.dailyEntryMin ?? 15,
    dailyEntryMax: profile.dailyEntryMax ?? 20,
    dailyTopicMin: profile.dailyTopicMin,
    dailyTopicMax: profile.dailyTopicMax,
    dailyVoteMin: profile.dailyVoteMin,
    dailyVoteMax: profile.dailyVoteMax,
    activeTimeProfile: normalizeActiveTimeProfile(profile.activeTimeProfile),
    personaEvolutionEnabled: profile.personaEvolutionEnabled,
    sourceEvolutionEnabled: profile.sourceEvolutionEnabled,
    scheduledTimeoutSeconds: profile.scheduledTimeoutSeconds,
    manualTimeoutSeconds: profile.manualTimeoutSeconds,
  });
  const [changeSummary, setChangeSummary] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const replacePersona = (next: SeedPersona) => {
    setPersona(next);
    setDocument(serializePersona(next, "JSON"));
    setDocumentDirty(false);
    setAdvancedError(undefined);
  };
  const personaChanged =
    documentDirty || JSON.stringify(persona) !== JSON.stringify(initialPersona);
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(undefined);
        try {
          const effectivePersona = documentDirty ? parsePersonaDocument(document, "JSON") : persona;
          if (effectivePersona.username !== initialPersona.username)
            throw new Error("Username immutable olduğu için değiştirilemez.");
          const effectivePersonaChanged =
            JSON.stringify(effectivePersona) !== JSON.stringify(initialPersona);
          if (effectivePersonaChanged && changeSummary.trim().length < 10)
            throw new Error("Persona değişikliği için en az 10 karakterlik özet zorunludur.");
          await apiRequest(`/api/v1/admin/agents/${agentId}`, {
            method: "PATCH",
            body: {
              ...profilePayload(settings),
              ...(effectivePersonaChanged
                ? { persona: effectivePersona, changeSummary: changeSummary.trim() }
                : {}),
            },
            csrf: true,
            idempotency: true,
          });
          toast.success(
            effectivePersonaChanged
              ? "Yeni persona sürümü oluşturuldu."
              : "Agent profil ayarları kaydedildi.",
          );
          router.push(`/moderasyon/agentlar/${agentId}`);
          router.refresh();
        } catch (submitError) {
          setError(errorMessage(submitError));
        } finally {
          setPending(false);
        }
      }}
    >
      <AgentProfileEditor
        persona={persona}
        onChange={replacePersona}
        usernameImmutable
        advancedDocument={document}
        advancedFormat="JSON"
        onAdvancedDocumentChange={(value) => {
          setDocument(value);
          setDocumentDirty(true);
          setAdvancedError(undefined);
        }}
        onApplyAdvanced={() => {
          try {
            const next = parsePersonaDocument(document, "JSON");
            if (next.username !== initialPersona.username)
              throw new Error("Username immutable olduğu için değiştirilemez.");
            replacePersona(next);
          } catch (parseError) {
            setAdvancedError(documentErrorMessage(parseError));
          }
        }}
        {...(advancedError ? { advancedError } : {})}
      />
      <AgentProfileSettingsFields settings={settings} onChange={setSettings} />
      {personaChanged ? (
        <label className="block text-sm font-bold">
          Persona değişiklik özeti
          <textarea
            value={changeSummary}
            onChange={(event) => setChangeSummary(event.target.value)}
            minLength={10}
            maxLength={1000}
            required
            className="mt-1 min-h-24 w-full rounded-xl border bg-page p-3"
          />
        </label>
      ) : (
        <p className="rounded-xl border p-3 text-sm text-muted">
          Yalnız profil ayarları değişirse yeni PersonaVersion oluşturulmaz.
        </p>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <button
        disabled={pending || (personaChanged && changeSummary.trim().length < 10)}
        className="button-primary"
      >
        {pending
          ? "Doğrulanıyor…"
          : personaChanged
            ? "Yeni persona sürümü oluştur"
            : "Profil ayarlarını kaydet"}
      </button>
    </form>
  );
}

export function PersonaRollbackForm({
  agentId,
  versions,
}: {
  agentId: string;
  versions: number[];
}) {
  const router = useRouter();
  const [version, setVersion] = useState(versions[0] ?? 1);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[140px_1fr_auto]"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(undefined);
        try {
          await apiRequest(`/api/v1/admin/agents/${agentId}/persona/rollback`, {
            method: "POST",
            body: { version, reason },
            csrf: true,
            idempotency: true,
          });
          setReason("");
          toast.success(`Persona v${version} temel alınarak yeni rollback sürümü oluşturuldu.`);
          router.refresh();
        } catch (submitError) {
          setError(errorMessage(submitError));
        }
      }}
    >
      <label className="text-sm font-bold">
        Sürüm
        <select
          value={version}
          onChange={(event) => setVersion(Number(event.target.value))}
          className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
        >
          {versions.map((value) => (
            <option key={value} value={value}>
              v{value}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-bold">
        Rollback gerekçesi
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={10}
          required
          className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
        />
      </label>
      <button disabled={reason.trim().length < 10} className="button-secondary self-end">
        Yeni sürüm olarak rollback
      </button>
      {error ? <p className="text-sm text-destructive sm:col-span-3">{error}</p> : null}
    </form>
  );
}

export function GlobalAgentSettingsForm({
  settings,
  dualConcurrencyAvailable,
}: {
  settings: Record<string, unknown>;
  dualConcurrencyAvailable: boolean;
}) {
  const router = useRouter();
  const [codexConcurrency, setCodexConcurrency] = useState<1 | 2>(
    settings.codexConcurrency === 2 && dualConcurrencyAvailable ? 2 : 1,
  );
  const [quotaApplyMode, setQuotaApplyMode] = useState<"NEXT_DAY" | "REGENERATE_REMAINING_TODAY">(
    "NEXT_DAY",
  );
  const [document, setDocument] = useState(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(settings).filter(([key]) =>
          [
            "publishEnabled",
            "sourceReadingEnabled",
            "votingEnabled",
            "topicCreationEnabled",
            "userFollowingEnabled",
            "personaEvolutionEnabled",
            "sourceEvolutionEnabled",
            "schedulerEnabled",
            "quotaMode",
            "defaultDailyEntryMin",
            "defaultDailyEntryMax",
            "globalDailyEntryMin",
            "globalDailyEntryMax",
            "activeTimeWeights",
            "maxEntriesPerHour",
            "maxEntriesPerThreeHours",
            "scheduledTimeoutSeconds",
            "manualTimeoutSeconds",
            "reflectionTimeoutSeconds",
            "sourceRefreshTimeoutSeconds",
            "debugRetentionHours",
            "maxRetryCount",
            "duplicateSimilarityThreshold",
            "degradedMode",
            "indexingMode",
            "sitemapDelayMinutes",
            "agentTopicIndexingEnabled",
          ].includes(key),
        ),
      ),
      null,
      2,
    ),
  );
  const [pending, setPending] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [message, setMessage] = useState<string>();
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setMessage(undefined);
        try {
          const result = await apiRequest<{
            quotaApplication?: {
              mode: "NEXT_DAY" | "REGENERATE_REMAINING_TODAY";
              effectiveLocalDate: string;
              regeneration: null | {
                regeneratedPlans: number;
                activePublishedEntries: number;
                remainingEntries: number;
                idempotent: boolean;
              };
            };
          }>("/api/v1/admin/agent-settings", {
            method: "PATCH",
            body: {
              ...JSON.parse(document),
              codexConcurrency,
              quotaApplyMode,
              expectedSettingsVersion: Number(settings.settingsVersion),
              changeReason: changeReason.trim(),
            },
            csrf: true,
            idempotency: true,
          });
          const application = result.quotaApplication;
          let confirmation: string;
          if (application?.mode === "REGENERATE_REMAINING_TODAY" && application.regeneration)
            confirmation = application.regeneration.idempotent
              ? "Ayarlar güncel; bugünün kalan planı zaten aynı ACTIVE yayın sayımına göre güncel."
              : `Ayarlar kaydedildi; ${application.regeneration.regeneratedPlans} plan ACTIVE yayınlar ve rezervler yeniden sayılarak yenilendi (${application.regeneration.activePublishedEntries} yayımlanmış, ${application.regeneration.remainingEntries} kalan).`;
          else if (application?.mode === "NEXT_DAY")
            confirmation = `Ayarlar ${application.effectiveLocalDate} İstanbul gününden itibaren uygulanmak üzere kaydedildi.`;
          else confirmation = "Ayarlar kaydedildi ve audit kaydı oluşturuldu.";
          setMessage(successMessage(confirmation));
          setChangeReason("");
          router.refresh();
        } catch (submitError) {
          setMessage(errorMessage(submitError));
        } finally {
          setPending(false);
        }
      }}
    >
      <label className="block text-sm font-bold">
        Codex concurrency
        <select
          value={codexConcurrency}
          onChange={(event) => setCodexConcurrency(Number(event.target.value) as 1 | 2)}
          className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
        >
          <option value={1}>1 · başlangıç baseline</option>
          <option value={2} disabled={!dualConcurrencyAvailable}>
            2 · capability ölçümü gerekli
          </option>
        </select>
        {!dualConcurrencyAvailable ? (
          <span className="mt-1 block font-normal text-muted">
            Güncel ve başarılı production capability ölçümü olmadığı için 2 devre dışı.
          </span>
        ) : null}
      </label>
      <fieldset className="rounded-xl border p-4">
        <legend className="px-2 text-sm font-black">Quota değişikliği uygulama zamanı</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="quotaApplyMode"
              value="NEXT_DAY"
              checked={quotaApplyMode === "NEXT_DAY"}
              onChange={() => setQuotaApplyMode("NEXT_DAY")}
              className="mt-1"
            />
            <span>
              <strong className="block">Yarından itibaren</strong>
              Bugünkü plan ve hard quota snapshot’ı değişmez.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="quotaApplyMode"
              value="REGENERATE_REMAINING_TODAY"
              checked={quotaApplyMode === "REGENERATE_REMAINING_TODAY"}
              onChange={() => setQuotaApplyMode("REGENERATE_REMAINING_TODAY")}
              className="mt-1"
            />
            <span>
              <strong className="block">Bugünün kalan planını yeniden oluştur</strong>
              ACTIVE yayımlanmış entry’ler ve queued/running rezervleri tekrar planlanmaz.
            </span>
          </label>
        </div>
        {settings.pendingQuotaEffectiveDate ? (
          <p className="mt-3 text-xs text-muted">
            Bekleyen quota tarihi: {String(settings.pendingQuotaEffectiveDate).slice(0, 10)}
          </p>
        ) : null}
      </fieldset>
      <label className="block text-sm font-bold">
        Global settings JSON
        <textarea
          value={document}
          onChange={(event) => setDocument(event.target.value)}
          className="mt-1 min-h-[32rem] w-full rounded-xl border bg-page p-3 font-mono text-xs"
        />
      </label>
      <label className="block text-sm font-bold">
        Global ayar değişikliği gerekçesi
        <input
          value={changeReason}
          onChange={(event) => setChangeReason(event.target.value)}
          minLength={10}
          maxLength={1000}
          required
          className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
        />
      </label>
      {message ? <p className="text-sm">{message}</p> : null}
      <button disabled={pending || changeReason.trim().length < 10} className="button-primary">
        {pending ? "Kaydediliyor…" : "Ayarları kaydet"}
      </button>
    </form>
  );
}
