import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { AgentSourceAdmin } from "@/components/agents/agent-source-admin";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { pageFrom } from "@/lib/http/pagination";
import { parseUuid } from "@/lib/http/request";
import {
  agentSourceStatuses,
  type AgentSourceStatusValue,
  listAgentDashboard,
  listAgentSources,
} from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Agent kaynakları",
  robots: { index: false, follow: false },
};

interface PageParams {
  page?: string;
  agentProfileId?: string;
  status?: string;
  adminPinned?: string;
  adminBlocked?: string;
  domain?: string;
}

const statuses = new Set<AgentSourceStatusValue>(agentSourceStatuses);

const bool = (value: string | undefined) =>
  value === "true" ? true : value === "false" ? false : undefined;

export default async function AgentSourcesPage({
  searchParams,
}: {
  searchParams: Promise<PageParams>;
}) {
  const session = await requireAgentAdminPage();
  const params = await searchParams;
  const page = pageFrom(params.page);
  const pageSize = 20;
  const actor = actorFromSession(session, randomUUID(), "WEB");
  const adminPinned = bool(params.adminPinned);
  const adminBlocked = bool(params.adminBlocked);
  const status = params.status as AgentSourceStatusValue | undefined;
  const [[sources, totalItems], agents] = await Promise.all([
    listAgentSources(getDatabase(), actor, {
      ...(params.agentProfileId
        ? { agentProfileId: parseUuid(params.agentProfileId, "agentProfileId") }
        : {}),
      ...(status && statuses.has(status) ? { status } : {}),
      ...(adminPinned !== undefined ? { adminPinned } : {}),
      ...(adminBlocked !== undefined ? { adminBlocked } : {}),
      ...(params.domain ? { domain: params.domain } : {}),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    listAgentDashboard(getDatabase(), actor),
  ]);
  const query = new URLSearchParams(
    Object.entries(params).filter(
      (entry): entry is [string, string] => Boolean(entry[1]) && entry[0] !== "page",
    ),
  );
  return (
    <ModerationLayout
      title="Agent kaynakları"
      description="Source durumunu, pin/block kararını ve haftalık sınırlı skor değişimlerini yönetin."
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
                {agent.user.displayName}
              </option>
            ))}
          </select>
        </label>
        <SelectFilter
          label="Status"
          name="status"
          value={params.status}
          options={["SEED", "DISCOVERED", "PROBATION", "TRUSTED", "DORMANT", "REJECTED", "BLOCKED"]}
        />
        <SelectFilter
          label="Pinned"
          name="adminPinned"
          value={params.adminPinned}
          options={["true", "false"]}
        />
        <SelectFilter
          label="Blocked"
          name="adminBlocked"
          value={params.adminBlocked}
          options={["true", "false"]}
        />
        <label className="text-sm font-bold">
          Domain
          <input
            name="domain"
            defaultValue={params.domain}
            className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
          />
        </label>
        <button className="button-secondary self-end">Filtrele</button>
      </form>
      <AgentSourceAdmin
        rows={sources.map((source) => ({
          ...source,
          lastFetchedAt: source.lastFetchedAt?.toISOString() ?? null,
          lastUsefulAt: source.lastUsefulAt?.toISOString() ?? null,
        }))}
      />
      <PaginationLinks
        page={page}
        totalPages={Math.max(1, Math.ceil(totalItems / pageSize))}
        hrefFor={(next) => `?${query.toString()}${query.size ? "&" : ""}page=${next}`}
      />
    </ModerationLayout>
  );
}

function SelectFilter({
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
