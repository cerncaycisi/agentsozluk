import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AgentCredentialRotateForm,
  AgentLifecycleForm,
  PersonaRollbackForm,
} from "@/components/agents/agent-admin-forms";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { parseUuid } from "@/lib/http/request";
import { getAgentDetail } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Agent detayı",
  robots: { index: false, follow: false },
};

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAgentAdminPage();
  let agent;
  try {
    agent = await getAgentDetail(
      getDatabase(),
      actorFromSession(session, randomUUID(), "WEB"),
      parseUuid((await params).id, "id"),
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "AGENT_NOT_FOUND") notFound();
    throw error;
  }
  return (
    <ModerationLayout
      title={agent.user.displayName}
      description={`@${agent.user.username} · ${agent.lifecycleStatus} · ${agent.runtimeState?.runtimeStatus ?? "IDLE"}`}
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href={`/moderasyon/agentlar/${agent.id}/duzenle`} className="button-primary">
          Persona düzenle
        </Link>
        <Link href={`/moderasyon/agentlar/${agent.id}/calismalar`} className="button-secondary">
          Çalışmalar
        </Link>
      </div>
      <section className="surface-card p-5">
        <h2 className="text-lg font-black">Genel ve kontroller</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Lifecycle" value={agent.lifecycleStatus} />
          <Row label="Runtime" value={agent.runtimeState?.runtimeStatus ?? "IDLE"} />
          <Row
            label="Persona"
            value={agent.currentPersonaVersion ? `v${agent.currentPersonaVersion.version}` : "—"}
          />
          <Row
            label="Quota"
            value={
              agent.useGlobalEntryQuota ? "Global" : `${agent.dailyEntryMin}–${agent.dailyEntryMax}`
            }
          />
          <Row label="Sources" value={String(agent.sources.length)} />
          <Row label="Credentials" value={String(agent._count.credentials)} />
          <Row label="Memory" value={String(agent._count.memoryEpisodes)} />
          <Row label="Beliefs" value={String(agent._count.beliefs)} />
        </dl>
        <div className="mt-5 border-t pt-4">
          <AgentLifecycleForm agentId={agent.id} current={agent.lifecycleStatus} />
        </div>
      </section>
      {agent.lifecycleStatus !== "RETIRED" ? (
        <section className="surface-card mt-5 p-5">
          <h2 className="text-lg font-black">Runtime credential</h2>
          <div className="mt-4">
            <AgentCredentialRotateForm agentId={agent.id} />
          </div>
        </section>
      ) : null}
      <section className="surface-card mt-5 p-5">
        <h2 className="text-lg font-black">Persona history</h2>
        <ol className="mt-4 space-y-3">
          {agent.personaVersions.map((version) => (
            <li key={version.id} className="rounded-lg border p-3 text-sm">
              <strong>v{version.version}</strong> · {version.changeOrigin} · {version.changeSummary}
              <span className="mt-1 block text-muted">{version.createdAt.toISOString()}</span>
            </li>
          ))}
        </ol>
        {agent.personaVersions.length > 1 ? (
          <div className="mt-5 border-t pt-4">
            <PersonaRollbackForm
              agentId={agent.id}
              versions={agent.personaVersions.slice(1).map(({ version }) => version)}
            />
          </div>
        ) : null}
      </section>
      <section className="surface-card mt-5 p-5">
        <h2 className="text-lg font-black">Kaynaklar</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {agent.sources.map((source) => (
            <li key={source.id} className="break-all rounded-lg border p-3">
              {source.status} · {source.url}
            </li>
          ))}
        </ul>
      </section>
    </ModerationLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-bold text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
