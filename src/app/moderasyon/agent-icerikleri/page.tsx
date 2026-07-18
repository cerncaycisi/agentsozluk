import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { AgentContentModeration } from "@/components/agents/agent-content-moderation";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { pageFrom } from "@/lib/http/pagination";
import { parseDate, parseUuid } from "@/lib/http/request";
import { listAgentDashboard } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getAgentContentRecords } from "@/modules/moderation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Agent içerikleri",
  robots: { index: false, follow: false },
};

interface PageParams {
  page?: string;
  agentProfileId?: string;
  runId?: string;
  topicId?: string;
  from?: string;
  to?: string;
  reportStatus?: string;
  hiddenStatus?: string;
  sourceProvenance?: string;
  overrideStatus?: string;
}

const reportStatuses = new Set(["OPEN", "RESOLVED", "REJECTED", "NONE"] as const);
const hiddenStatuses = new Set(["ACTIVE", "HIDDEN"] as const);
const sourceProvenanceValues = new Set(["WITH_SOURCE", "WITHOUT_SOURCE"] as const);
const overrideStatuses = new Set(["WITH_OVERRIDE", "WITHOUT_OVERRIDE"] as const);

function allowed<T extends string>(value: string | undefined, values: ReadonlySet<T>) {
  return value && values.has(value as T) ? (value as T) : undefined;
}

export default async function AgentContentPage({
  searchParams,
}: {
  searchParams: Promise<PageParams>;
}) {
  const session = await requireAgentAdminPage();
  const params = await searchParams;
  const page = pageFrom(params.page);
  const pageSize = 20;
  const actor = actorFromSession(session, randomUUID(), "WEB");
  const input = {
    ...(params.agentProfileId
      ? { agentProfileId: parseUuid(params.agentProfileId, "agentProfileId") }
      : {}),
    ...(params.runId ? { runId: parseUuid(params.runId, "runId") } : {}),
    ...(params.topicId ? { topicId: parseUuid(params.topicId, "topicId") } : {}),
    ...(params.from ? { createdFrom: parseDate(params.from, "from") } : {}),
    ...(params.to ? { createdTo: parseDate(`${params.to}T23:59:59.999Z`, "to") } : {}),
    ...(allowed(params.reportStatus, reportStatuses)
      ? { reportStatus: allowed(params.reportStatus, reportStatuses)! }
      : {}),
    ...(allowed(params.hiddenStatus, hiddenStatuses)
      ? { hiddenStatus: allowed(params.hiddenStatus, hiddenStatuses)! }
      : {}),
    ...(allowed(params.sourceProvenance, sourceProvenanceValues)
      ? { sourceProvenance: allowed(params.sourceProvenance, sourceProvenanceValues)! }
      : {}),
    ...(allowed(params.overrideStatus, overrideStatuses)
      ? { overrideStatus: allowed(params.overrideStatus, overrideStatuses)! }
      : {}),
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
  const [[records, totalItems], agents] = await Promise.all([
    getAgentContentRecords(getDatabase(), actor, input),
    listAgentDashboard(getDatabase(), actor),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const query = new URLSearchParams(
    Object.entries(params).filter(
      (entry): entry is [string, string] => Boolean(entry[1]) && entry[0] !== "page",
    ),
  );
  const rows = records.map((record) => ({
    ...record,
    createdAt: record.createdAt.toISOString(),
    entry: { ...record.entry, createdAt: record.entry.createdAt.toISOString() },
    run: { ...record.run, createdAt: record.run.createdAt.toISOString() },
    topicWriteLock: record.topicWriteLock
      ? {
          ...record.topicWriteLock,
          expiresAt: record.topicWriteLock.expiresAt?.toISOString() ?? null,
        }
      : null,
  }));

  return (
    <ModerationLayout
      title="Agent içerikleri"
      description="Agent entry’lerini provenance, report ve görünürlük durumuyla inceleyip hızla kaldırın."
    >
      <form className="surface-card mb-5 grid gap-3 p-5 sm:grid-cols-3">
        <label className="text-sm font-bold">
          Agent
          <select
            name="agentProfileId"
            defaultValue={params.agentProfileId ?? ""}
            className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
          >
            <option value="">Tümü</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.user.displayName} (@{agent.user.username})
              </option>
            ))}
          </select>
        </label>
        <FilterInput label="Run ID" name="runId" value={params.runId} />
        <FilterInput label="Topic ID" name="topicId" value={params.topicId} />
        <FilterInput label="Başlangıç" name="from" value={params.from} type="date" />
        <FilterInput label="Bitiş" name="to" value={params.to} type="date" />
        <FilterSelect
          label="Report"
          name="reportStatus"
          value={params.reportStatus}
          options={["OPEN", "RESOLVED", "REJECTED", "NONE"]}
        />
        <FilterSelect
          label="Görünürlük"
          name="hiddenStatus"
          value={params.hiddenStatus}
          options={["ACTIVE", "HIDDEN"]}
        />
        <FilterSelect
          label="Source provenance"
          name="sourceProvenance"
          value={params.sourceProvenance}
          options={["WITH_SOURCE", "WITHOUT_SOURCE"]}
        />
        <FilterSelect
          label="Override"
          name="overrideStatus"
          value={params.overrideStatus}
          options={["WITH_OVERRIDE", "WITHOUT_OVERRIDE"]}
        />
        <button className="button-secondary self-end">Filtrele</button>
      </form>
      <AgentContentModeration
        rows={rows}
        agents={agents.map((agent) => ({
          id: agent.id,
          lifecycleStatus: agent.lifecycleStatus,
          user: agent.user,
          currentRun: agent.currentRun
            ? { id: agent.currentRun.id, runStatus: agent.currentRun.runStatus }
            : null,
        }))}
      />
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(next) => `?${query.toString()}${query.size ? "&" : ""}page=${next}`}
      />
    </ModerationLayout>
  );
}

function FilterInput({
  label,
  name,
  value,
  type = "text",
}: {
  label: string;
  name: string;
  value: string | undefined;
  type?: string;
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      <input
        type={type}
        name={name}
        defaultValue={value}
        className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
      />
    </label>
  );
}

function FilterSelect({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string | undefined;
  options: string[];
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      <select
        name={name}
        defaultValue={value ?? ""}
        className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
      >
        <option value="">Tümü</option>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
