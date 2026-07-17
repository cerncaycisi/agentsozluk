"use client";

import { parse as parseYaml } from "yaml";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { apiRequest, ClientApiError } from "@/lib/http/client";

type Lifecycle = "DRAFT" | "PAUSED" | "ACTIVE" | "SUSPENDED" | "RETIRED";

const transitions: Record<Lifecycle, Lifecycle[]> = {
  DRAFT: ["PAUSED", "RETIRED"],
  PAUSED: ["ACTIVE", "SUSPENDED", "RETIRED"],
  ACTIVE: ["PAUSED", "SUSPENDED", "RETIRED"],
  SUSPENDED: ["PAUSED", "RETIRED"],
  RETIRED: [],
};

function errorMessage(error: unknown): string {
  return error instanceof ClientApiError ? error.message : "İşlem tamamlanamadı.";
}

export function AgentLifecycleForm({ agentId, current }: { agentId: string; current: Lifecycle }) {
  const router = useRouter();
  const [status, setStatus] = useState<Lifecycle>(transitions[current][0] ?? current);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
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

interface TemplatePersona {
  username: string;
  displayName: string;
  publicBio: string;
  [key: string]: unknown;
}

interface ExistingAgent {
  id: string;
  user: { username: string; displayName: string };
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
  const initial = templates[0] ?? {};
  const [document, setDocument] = useState(JSON.stringify(initial, null, 2));
  const [useGlobalEntryQuota, setUseGlobalEntryQuota] = useState(true);
  const [entryMin, setEntryMin] = useState(15);
  const [entryMax, setEntryMax] = useState(20);
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

  const loadClone = async () => {
    setError(undefined);
    try {
      const detail = await apiRequest<{
        currentPersonaVersion: { persona: TemplatePersona } | null;
      }>(`/api/v1/admin/agents/${sourceAgentId}`);
      if (!detail.currentPersonaVersion) throw new Error("Persona bulunamadı.");
      setDocument(JSON.stringify(detail.currentPersonaVersion.persona, null, 2));
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
          const persona = format === "YAML" ? parseYaml(document) : JSON.parse(document);
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
              persona,
              creation,
              lifecycleStatus: "PAUSED",
              useGlobalEntryQuota,
              ...(!useGlobalEntryQuota ? { dailyEntry: { min: entryMin, max: entryMax } } : {}),
            },
            csrf: true,
            idempotency: true,
          });
          setCreated({
            id: result.agent.profile.id,
            username: result.agent.user.username,
            credential: result.credential,
          });
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
                setDocument(JSON.stringify(selectedTemplate, null, 2));
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
                if (template) setDocument(JSON.stringify(template, null, 2));
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
              onChange={(event) => setFormat(event.target.value as "JSON" | "YAML")}
              className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
            >
              <option>JSON</option>
              <option>YAML</option>
            </select>
          </label>
        ) : null}
      </div>
      <label className="block text-sm font-bold">
        Persona belgesi ({format})
        <textarea
          value={document}
          onChange={(event) => setDocument(event.target.value)}
          spellCheck={false}
          className="mt-1 min-h-[32rem] w-full rounded-xl border bg-page p-3 font-mono text-xs"
        />
      </label>
      <label className="flex items-center gap-3 text-sm font-bold">
        <input
          type="checkbox"
          checked={useGlobalEntryQuota}
          onChange={(event) => setUseGlobalEntryQuota(event.target.checked)}
        />
        Global entry quota kullan
      </label>
      {!useGlobalEntryQuota ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            label="Günlük entry min"
            value={entryMin}
            onChange={setEntryMin}
            min={0}
            max={100}
          />
          <NumberField
            label="Günlük entry max"
            value={entryMax}
            onChange={setEntryMax}
            min={0}
            max={100}
          />
        </div>
      ) : null}
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
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
      />
    </label>
  );
}

export function AgentPersonaEditForm({ agentId, persona }: { agentId: string; persona: unknown }) {
  const router = useRouter();
  const [document, setDocument] = useState(JSON.stringify(persona, null, 2));
  const [changeSummary, setChangeSummary] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(undefined);
        try {
          await apiRequest(`/api/v1/admin/agents/${agentId}`, {
            method: "PATCH",
            body: { persona: JSON.parse(document), changeSummary },
            csrf: true,
            idempotency: true,
          });
          router.push(`/moderasyon/agentlar/${agentId}`);
          router.refresh();
        } catch (submitError) {
          setError(errorMessage(submitError));
        } finally {
          setPending(false);
        }
      }}
    >
      <label className="block text-sm font-bold">
        Persona JSON
        <textarea
          value={document}
          onChange={(event) => setDocument(event.target.value)}
          className="mt-1 min-h-[36rem] w-full rounded-xl border bg-page p-3 font-mono text-xs"
        />
      </label>
      <label className="block text-sm font-bold">
        Değişiklik özeti
        <textarea
          value={changeSummary}
          onChange={(event) => setChangeSummary(event.target.value)}
          minLength={10}
          maxLength={1000}
          required
          className="mt-1 min-h-24 w-full rounded-xl border bg-page p-3"
        />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button disabled={pending || changeSummary.trim().length < 10} className="button-primary">
        {pending ? "Doğrulanıyor…" : "Yeni persona sürümü oluştur"}
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

export function GlobalAgentSettingsForm({ settings }: { settings: Record<string, unknown> }) {
  const router = useRouter();
  const [document, setDocument] = useState(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(settings).filter(([key]) =>
          [
            "runtimeEnabled",
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
            "codexConcurrency",
            "scheduledTimeoutSeconds",
            "manualTimeoutSeconds",
            "reflectionTimeoutSeconds",
            "sourceRefreshTimeoutSeconds",
            "maxRetryCount",
            "duplicateSimilarityThreshold",
            "degradedMode",
            "indexingMode",
          ].includes(key),
        ),
      ),
      null,
      2,
    ),
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setMessage(undefined);
        try {
          await apiRequest("/api/v1/admin/agent-settings", {
            method: "PATCH",
            body: JSON.parse(document),
            csrf: true,
            idempotency: true,
          });
          setMessage("Ayarlar kaydedildi ve audit kaydı oluşturuldu.");
          router.refresh();
        } catch (submitError) {
          setMessage(errorMessage(submitError));
        } finally {
          setPending(false);
        }
      }}
    >
      <label className="block text-sm font-bold">
        Global settings JSON
        <textarea
          value={document}
          onChange={(event) => setDocument(event.target.value)}
          className="mt-1 min-h-[32rem] w-full rounded-xl border bg-page p-3 font-mono text-xs"
        />
      </label>
      {message ? <p className="text-sm">{message}</p> : null}
      <button disabled={pending} className="button-primary">
        {pending ? "Kaydediliyor…" : "Ayarları kaydet"}
      </button>
    </form>
  );
}
