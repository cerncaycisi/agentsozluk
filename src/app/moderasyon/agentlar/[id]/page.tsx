import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AgentCredentialRotateForm,
  AgentLifecycleForm,
  AgentLifecycleQuickAction,
  AgentQuickRunActions,
  AgentRunCommands,
  PersonaRollbackForm,
} from "@/components/agents/agent-admin-forms";
import { AgentDetailNavigation } from "@/components/agents/agent-detail-navigation";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { formatIstanbulTimestamp } from "@/lib/format/time";
import { AppError } from "@/lib/http/errors";
import { parseUuid } from "@/lib/http/request";
import { getAgentDetail } from "@/modules/agents";
import { seedPersonaSchema } from "@/modules/agents/personas/schema";
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
  const persona = agent.currentPersonaVersion
    ? seedPersonaSchema.safeParse(agent.currentPersonaVersion.persona)
    : null;
  const currentPersona = persona?.success ? persona.data : null;
  const runtime = agent.runtimeState;
  const entryTarget = runtime?.todayEntryTarget ?? 0;
  const targetProjection =
    entryTarget === 0 ? null : (runtime?.todayPublishedEntries ?? 0) / entryTarget;
  const succeededActions = agent.actions.filter(({ actionStatus }) => actionStatus === "SUCCEEDED");
  const actionCount = (...types: Array<(typeof succeededActions)[number]["actionType"]>) =>
    succeededActions.filter(({ actionType }) => types.includes(actionType)).length;
  return (
    <ModerationLayout
      title={agent.user.displayName}
      description={`@${agent.user.username} · ${agent.lifecycleStatus} · ${agent.runtimeState?.runtimeStatus ?? "IDLE"}`}
    >
      <AgentDetailNavigation agentId={agent.id} />
      <section id="genel" className="surface-card scroll-mt-24 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black">Genel durum</h2>
            <p className="mt-1 text-sm text-muted">
              Heartbeat, bugünkü hedef ve çalışan run’ın güncel read model’i.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/moderasyon/agentlar/${agent.id}/duzenle`} className="button-secondary">
              Persona ve profili düzenle
            </Link>
            <Link href={`/moderasyon/agentlar/${agent.id}/calismalar`} className="button-secondary">
              Çalışmaları aç
            </Link>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Row label="Lifecycle" value={agent.lifecycleStatus} />
          <Row label="Runtime" value={runtime?.runtimeStatus ?? "IDLE"} />
          <Row
            label="Son heartbeat"
            value={formatNullableTimestamp(runtime?.lastHeartbeatAt ?? null)}
          />
          <Row
            label="Sonraki run"
            value={formatNullableTimestamp(runtime?.nextScheduledAt ?? null)}
          />
          <Row
            label="Bugünkü entry"
            value={`${runtime?.todayPublishedEntries ?? 0}/${entryTarget}`}
          />
          <Row
            label="Bugünkü topic"
            value={`${runtime?.todayCreatedTopics ?? 0}/${runtime?.todayTopicTarget ?? 0}`}
          />
          <Row
            label="Bugünkü vote"
            value={`${runtime?.todayVotes ?? 0}/${runtime?.todayVoteTarget ?? 0}`}
          />
          <Row
            label="Target projection"
            value={
              targetProjection === null
                ? "—"
                : new Intl.NumberFormat("tr-TR", {
                    style: "percent",
                    maximumFractionDigits: 1,
                  }).format(targetProjection)
            }
          />
          <Row
            label="Mevcut run"
            value={
              runtime?.currentRun
                ? `${runtime.currentRun.runType} · ${runtime.currentRun.runStatus}`
                : "—"
            }
          />
          <Row
            label="Run başlangıcı"
            value={formatNullableTimestamp(runtime?.currentRun?.startedAt ?? null)}
          />
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
        {agent.lifecycleStatus === "ACTIVE" ? (
          <div className="mt-5 border-t pt-4">
            <AgentQuickRunActions agentId={agent.id} username={agent.user.username} />
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {agent.lifecycleStatus === "ACTIVE" || agent.lifecycleStatus === "PAUSED" ? (
            <AgentLifecycleQuickAction
              agentId={agent.id}
              username={agent.user.username}
              current={agent.lifecycleStatus}
            />
          ) : null}
          <Link
            href={`/moderasyon/agent-icerikleri?agentProfileId=${agent.id}`}
            className="button-secondary"
          >
            Entry’leri incele ve toplu gizle @{agent.user.username}
          </Link>
        </div>
        {runtime?.currentRun ? (
          <div className="mt-4 rounded-xl border p-4">
            <Link
              href={`/moderasyon/agentlar/calisma/${runtime.currentRun.id}`}
              className="font-bold text-primary"
            >
              Mevcut run detayını aç
            </Link>
            <AgentRunCommands runId={runtime.currentRun.id} status={runtime.currentRun.runStatus} />
          </div>
        ) : null}
      </section>

      <section id="ilgi-ve-kanaatler" className="surface-card mt-5 scroll-mt-24 p-5">
        <h2 className="text-lg font-black">İlgi ve kanaatler</h2>
        {currentPersona ? (
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="font-bold">Persona ilgi alanları</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {currentPersona.interests.map((interest) => (
                  <li key={interest.key} className="rounded-lg border p-3">
                    {interest.key} · {Math.round(interest.weight * 100)}%
                    {interest.pinned ? " · sabit" : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-bold">Temel değerler</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {currentPersona.coreValues.map((value) => (
                  <li key={value.key} className="rounded-lg border p-3">
                    {value.key} · {Math.round(value.weight * 100)}%{value.pinned ? " · sabit" : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
        <h3 className="mt-5 font-bold">Son belief kayıtları</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {agent.beliefs.map((belief) => (
            <li key={belief.id} className="rounded-lg border p-3">
              <strong>{belief.topicKey}</strong> · {belief.status} · güven {belief.confidence}
              <p className="mt-1">{belief.statement}</p>
              <p className="mt-1 text-xs text-muted">
                v{belief.version} · {formatNullableTimestamp(belief.lastUpdatedAt)}
              </p>
            </li>
          ))}
        </ul>
        {agent.beliefs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Henüz belief kaydı yok.</p>
        ) : null}
      </section>

      <section id="iliskiler" className="surface-card mt-5 scroll-mt-24 p-5">
        <h2 className="text-lg font-black">İlişkiler</h2>
        <p className="mt-1 text-sm text-muted">
          Toplam {agent._count.relationships} ilişki; en son güncellenen 20 kayıt gösterilir.
        </p>
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {agent.relationships.map((relationship) => (
            <li key={relationship.id} className="rounded-lg border p-3 text-sm">
              <strong>
                {relationship.targetUser.displayName} (@{relationship.targetUser.username})
              </strong>
              <p className="mt-1">
                güven {relationship.trust} · ilgi {relationship.interest} · aşinalık{" "}
                {relationship.familiarity} · anlaşmazlık {relationship.disagreement}
              </p>
              <p className="mt-2 text-muted">{relationship.summary}</p>
            </li>
          ))}
        </ul>
        {agent.relationships.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Henüz ilişki kaydı yok.</p>
        ) : null}
      </section>

      <section id="oylar-ve-takipler" className="surface-card mt-5 scroll-mt-24 p-5">
        <h2 className="text-lg font-black">Oylar ve takipler</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Row
            label="Başarılı vote action"
            value={String(actionCount("VOTE_UP", "VOTE_DOWN", "REMOVE_VOTE"))}
          />
          <Row
            label="Başarılı topic follow action"
            value={String(actionCount("FOLLOW_TOPIC", "UNFOLLOW_TOPIC"))}
          />
          <Row
            label="Başarılı user follow action"
            value={String(actionCount("FOLLOW_USER", "UNFOLLOW_USER"))}
          />
          <Row label="Son 200 action" value={String(agent.actions.length)} />
        </dl>
      </section>

      <section id="schedule" className="surface-card mt-5 scroll-mt-24 p-5">
        <h2 className="text-lg font-black">Schedule</h2>
        <p className="mt-1 text-sm text-muted">
          Son yedi günlük plan ve her planın en fazla 24 slotu.
        </p>
        <div className="mt-4 space-y-3">
          {agent.dailyPlans.map((plan) => (
            <details key={plan.id} className="rounded-xl border p-3">
              <summary className="cursor-pointer font-bold">
                {plan.localDate.toISOString().slice(0, 10)} · {plan.status} · entry{" "}
                {plan.entryTarget}, topic {plan.topicTarget}, vote {plan.voteTarget}
              </summary>
              <ul className="mt-3 space-y-2 text-sm">
                {plan.slots.map((slot) => (
                  <li key={slot.id} className="rounded-lg bg-page p-2">
                    {formatNullableTimestamp(slot.scheduledAt)} · {slot.runType} · {slot.status}
                    {slot.runId ? (
                      <Link
                        href={`/moderasyon/agentlar/calisma/${slot.runId}`}
                        className="ml-2 font-bold text-primary"
                      >
                        Run
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
        {agent.dailyPlans.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Henüz günlük plan yok.</p>
        ) : null}
      </section>

      <section id="persona" className="surface-card mt-5 scroll-mt-24 p-5">
        <h2 className="text-lg font-black">Persona history</h2>
        <ol className="mt-4 space-y-3">
          {agent.personaVersions.map((version) => (
            <li key={version.id} className="rounded-lg border p-3 text-sm">
              <strong>v{version.version}</strong> · {version.changeOrigin} · {version.changeSummary}
              <span className="mt-1 block text-muted">
                {formatIstanbulTimestamp(version.createdAt, { includeSeconds: true })}
              </span>
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
      <section id="kaynaklar" className="surface-card mt-5 scroll-mt-24 p-5">
        <h2 className="text-lg font-black">Kaynaklar</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {agent.sources.map((source) => (
            <li key={source.id} className="break-all rounded-lg border p-3">
              {source.status} · {source.url}
            </li>
          ))}
        </ul>
      </section>

      <section id="kontroller" className="surface-card mt-5 scroll-mt-24 p-5">
        <h2 className="text-lg font-black">Kontroller</h2>
        <div className="mt-4">
          <AgentLifecycleForm agentId={agent.id} current={agent.lifecycleStatus} />
        </div>
        {agent.lifecycleStatus !== "RETIRED" ? (
          <div className="mt-5 border-t pt-5">
            <h3 className="font-black">Runtime credential</h3>
            <div className="mt-3">
              <AgentCredentialRotateForm agentId={agent.id} />
            </div>
          </div>
        ) : null}
      </section>
    </ModerationLayout>
  );
}

function formatNullableTimestamp(value: Date | null) {
  return value ? formatIstanbulTimestamp(value, { includeSeconds: true }) : "—";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-bold text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
