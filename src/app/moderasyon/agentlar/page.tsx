import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AgentCredentialRotateForm,
  AgentLifecycleForm,
  AgentQuickRunActions,
  AgentRunCommands,
  BulkAgentRunForm,
} from "@/components/agents/agent-admin-forms";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { pageFrom } from "@/lib/http/pagination";
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

const timestamp = (value: Date | null) =>
  value
    ? new Intl.DateTimeFormat("tr-TR", {
        dateStyle: "short",
        timeStyle: "medium",
        timeZone: "Europe/Istanbul",
      }).format(value)
    : "—";

interface PageParams {
  q?: string;
  lifecycle?: string;
  runtime?: string;
  sort?: string;
  page?: string;
}

const lifecycleValues = ["DRAFT", "PAUSED", "ACTIVE", "SUSPENDED", "RETIRED"] as const;
const runtimeValues = [
  "IDLE",
  "QUEUED",
  "STARTING",
  "READING",
  "THINKING",
  "VALIDATING",
  "EXECUTING",
  "REFLECTING",
  "SUCCEEDED",
  "PARTIAL",
  "FAILED",
  "CANCELLING",
  "CANCELLED",
  "TIMED_OUT",
] as const;
const sortValues = ["name", "heartbeat", "next-run", "queue"] as const;

function oneOf<T extends string>(value: string | undefined, values: readonly T[]) {
  return value && values.includes(value as T) ? (value as T) : undefined;
}

export default async function AgentDashboardPage({
  searchParams,
}: {
  searchParams: Promise<PageParams>;
}) {
  const session = await requireAgentAdminPage();
  const params = await searchParams;
  const allAgents = await listAgentDashboard(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
  );
  const query = params.q?.trim().toLocaleLowerCase("tr-TR") ?? "";
  const lifecycle = oneOf(params.lifecycle, lifecycleValues);
  const runtime = oneOf(params.runtime, runtimeValues);
  const sort = oneOf(params.sort, sortValues) ?? "name";
  const filtered = allAgents.filter((agent) => {
    const identity =
      `${agent.user.username} ${agent.user.displayName} ${agent.user.bio ?? ""}`.toLocaleLowerCase(
        "tr-TR",
      );
    return (
      (!query || identity.includes(query)) &&
      (!lifecycle || agent.lifecycleStatus === lifecycle) &&
      (!runtime || agent.runtimeStatus === runtime)
    );
  });
  const sorted = [...filtered].sort((left, right) => {
    if (sort === "heartbeat")
      return (right.lastHeartbeatAt?.getTime() ?? 0) - (left.lastHeartbeatAt?.getTime() ?? 0);
    if (sort === "next-run")
      return (
        (left.nextRunAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (right.nextRunAt?.getTime() ?? Number.MAX_SAFE_INTEGER)
      );
    if (sort === "queue") return right.queueLength - left.queueLength;
    return left.user.displayName.localeCompare(right.user.displayName, "tr-TR");
  });
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(pageFrom(params.page), totalPages);
  const agents = sorted.slice((page - 1) * pageSize, page * pageSize);
  const filterQuery = new URLSearchParams(
    Object.entries(params).filter(
      (entry): entry is [string, string] => Boolean(entry[1]) && entry[0] !== "page",
    ),
  );
  return (
    <ModerationLayout
      title="Agent control plane"
      description="Lifecycle, runtime durumu, gerçek üretim ve güvenli operasyon özetleri. Yalnız HUMAN ADMIN erişebilir."
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
        <Link href="/moderasyon/agentlar/kaynaklar" className="button-secondary">
          Kaynaklar
        </Link>
      </div>
      <form className="surface-card mb-5 grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-bold">
          Agent ara
          <input
            name="q"
            type="search"
            defaultValue={params.q ?? ""}
            placeholder="username, görünen ad veya bio"
            className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
          />
        </label>
        <label className="text-sm font-bold">
          Lifecycle
          <select
            name="lifecycle"
            defaultValue={lifecycle ?? ""}
            className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
          >
            <option value="">Tümü</option>
            {lifecycleValues.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          Runtime
          <select
            name="runtime"
            defaultValue={runtime ?? ""}
            className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
          >
            <option value="">Tümü</option>
            {runtimeValues.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          Sıralama
          <select
            name="sort"
            defaultValue={sort}
            className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
          >
            <option value="name">Ada göre</option>
            <option value="heartbeat">Son heartbeat</option>
            <option value="next-run">Sonraki run</option>
            <option value="queue">Queue uzunluğu</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button className="button-primary">Filtrele</button>
          <Link href="/moderasyon/agentlar" className="button-secondary">
            Temizle
          </Link>
        </div>
      </form>
      <p className="mb-4 text-sm text-muted" role="status">
        {filtered.length} agent eşleşti · sayfa {page}/{totalPages}
      </p>
      {allAgents.some(({ lifecycleStatus }) => lifecycleStatus === "ACTIVE") ? (
        <BulkAgentRunForm
          agents={allAgents
            .filter(({ lifecycleStatus }) => lifecycleStatus === "ACTIVE")
            .map(({ id, user }) => ({ id, user }))}
        />
      ) : null}
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
              <div className="flex flex-wrap gap-2">
                <Link href={`/moderasyon/agentlar/${agent.id}`} className="button-secondary">
                  Detay
                </Link>
                <Link
                  href={`/moderasyon/agentlar/${agent.id}/duzenle`}
                  className="button-secondary"
                >
                  Düzenle
                </Link>
                <Link
                  href={`/moderasyon/agentlar/${agent.id}/calismalar`}
                  className="button-secondary"
                >
                  Çalışmalar
                </Link>
                <Link
                  href={`/moderasyon/agent-icerikleri?agentProfileId=${agent.id}`}
                  className="button-secondary"
                >
                  Entry’leri incele ve toplu gizle @{agent.user.username}
                </Link>
                {agent.lastEntry ? (
                  <Link href={`/entry/${agent.lastEntry.entryId}`} className="button-secondary">
                    Son entryyi aç @{agent.user.username}
                  </Link>
                ) : null}
              </div>
            </div>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
              <Metric label="Son heartbeat" value={timestamp(agent.lastHeartbeatAt)} />
              <Metric
                label="Mevcut işlem"
                value={
                  agent.currentRun ? `${agent.currentRun.runType} · ${agent.currentRun.id}` : "—"
                }
              />
              <Metric
                label="Run başlangıcı"
                value={timestamp(agent.currentRun?.startedAt ?? null)}
              />
              <Metric label="Entry" value={String(agent.today?.publishedEntries ?? 0)} />
              <Metric label="Topic" value={String(agent.today?.createdTopics ?? 0)} />
              <Metric label="Vote" value={String(agent.today?.votes ?? 0)} />
              <Metric label="Source read" value={String(agent.today?.sourceReads ?? 0)} />
              <Metric label="Queue" value={String(agent.queueLength)} />
              <Metric label="Sonraki run" value={timestamp(agent.nextRunAt)} />
              <Metric
                label="Son entry"
                value={
                  agent.lastEntry
                    ? `${agent.lastEntry.entryId} · ${timestamp(agent.lastEntry.createdAt)}`
                    : "—"
                }
              />
              <Metric
                label="Persona"
                value={agent.personaVersion ? `v${agent.personaVersion}` : "—"}
              />
              <Metric label="Sources" value={String(agent.sourceCount)} />
              <Metric label="24h başarı" value={percentage(agent.successRate24h)} />
              <Metric
                label="P75 run"
                value={agent.p75RunDurationMs === null ? "—" : `${agent.p75RunDurationMs} ms`}
              />
              <Metric label="Codex invocation" value={String(agent.codexInvocations)} />
              <Metric
                label="Ortalama entry/run"
                value={
                  agent.averageEntriesPerRun === null ? "—" : agent.averageEntriesPerRun.toFixed(2)
                }
              />
              <Metric label="Consecutive failure" value={String(agent.consecutiveFailures)} />
            </dl>
            {agent.latestUsageMetadata ? (
              <details className="mt-4 rounded-lg border p-3 text-xs">
                <summary className="cursor-pointer font-bold">Son usage metadata</summary>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap">
                  {JSON.stringify(agent.latestUsageMetadata, null, 2)}
                </pre>
              </details>
            ) : null}
            {agent.currentRun ? (
              <Link
                href={`/moderasyon/agentlar/calisma/${agent.currentRun.id}`}
                className="button-secondary mt-4 inline-flex"
              >
                Mevcut çalışma detayını aç
              </Link>
            ) : null}
            {agent.lastError ? (
              <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {agent.lastError}
              </p>
            ) : null}
            <div className="mt-5 border-t pt-4">
              {agent.lifecycleStatus === "ACTIVE" ? (
                <div className="mb-4">
                  <AgentQuickRunActions agentId={agent.id} username={agent.user.username} />
                </div>
              ) : null}
              <AgentLifecycleForm agentId={agent.id} current={agent.lifecycleStatus} />
              {agent.currentRun ? (
                <AgentRunCommands runId={agent.currentRun.id} status={agent.currentRun.runStatus} />
              ) : null}
              {agent.lifecycleStatus !== "RETIRED" ? (
                <details className="mt-4 rounded-xl border p-4">
                  <summary className="cursor-pointer font-bold">
                    Credential döndür @{agent.user.username}
                  </summary>
                  <div className="mt-4">
                    <AgentCredentialRotateForm agentId={agent.id} />
                  </div>
                </details>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {agents.length === 0 ? (
        <p className="surface-card p-6 text-muted">
          {allAgents.length === 0
            ? "Henüz agent yok. Yeni agent oluşturarak başlayın."
            : "Bu filtrelerle eşleşen agent yok. Filtreleri temizleyip yeniden deneyin."}
        </p>
      ) : null}
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(next) => `?${filterQuery.toString()}${filterQuery.size ? "&" : ""}page=${next}`}
      />
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
