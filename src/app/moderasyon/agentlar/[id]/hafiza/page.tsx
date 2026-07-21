import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  MemoryForgetForm,
  MemoryInvalidateForm,
  MemoryReconsolidateForm,
} from "@/components/agents/agent-memory-admin";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { formatIstanbulTimestamp } from "@/lib/format/time";
import { AppError } from "@/lib/http/errors";
import { parseUuid } from "@/lib/http/request";
import { getAgentDetail, listAgentMemories } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Agent hafızası",
  robots: { index: false, follow: false },
};

export default async function AgentMemoryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAgentAdminPage();
  const agentId = parseUuid((await params).id, "id");
  const actor = actorFromSession(session, randomUUID(), "WEB");
  let agent;
  try {
    agent = await getAgentDetail(getDatabase(), actor, agentId);
  } catch (error) {
    if (error instanceof AppError && error.code === "AGENT_NOT_FOUND") notFound();
    throw error;
  }
  const [memories, totalItems] = await listAgentMemories(getDatabase(), actor, agentId, {
    skip: 0,
    take: 100,
  });
  const activeCount = memories.filter(({ invalidatedAt }) => invalidatedAt === null).length;

  return (
    <ModerationLayout
      title={`${agent.user.displayName} hafızası`}
      description={`@${agent.user.username} · ${activeCount} aktif kayıt gösteriliyor · toplam ${totalItems}`}
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href={`/moderasyon/agentlar/${agent.id}`} className="button-secondary">
          Agent detayına dön
        </Link>
      </div>
      <section className="surface-card mb-5 p-5">
        <MemoryReconsolidateForm agentId={agent.id} />
      </section>
      <div className="space-y-4">
        {memories.map((memory) => (
          <article key={memory.id} className="surface-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-black">
                  {memory.eventType} · {memory.provenance}
                </h2>
                <p className="mt-1 break-all text-xs text-muted">{memory.id}</p>
              </div>
              <span
                className={
                  memory.invalidatedAt
                    ? "rounded-full bg-destructive/10 px-3 py-1 text-xs font-bold text-destructive"
                    : "rounded-full bg-success/10 px-3 py-1 text-xs font-bold text-success"
                }
              >
                {memory.invalidatedAt ? "INVALIDATED" : "ACTIVE"}
              </span>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm">{memory.summary}</p>
            <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
              <MemoryFact label="Salience" value={String(memory.salience)} />
              <MemoryFact
                label="Occurred"
                value={formatIstanbulTimestamp(memory.occurredAt, { includeSeconds: true })}
              />
              <MemoryFact
                label="Invalidated"
                value={
                  memory.invalidatedAt
                    ? formatIstanbulTimestamp(memory.invalidatedAt, { includeSeconds: true })
                    : "—"
                }
              />
              <MemoryFact label="Subject" value={memory.subjectType ?? "—"} />
              <MemoryFact label="Subject ID" value={memory.subjectId ?? "—"} />
              <MemoryFact label="Run ID" value={memory.runId ?? "—"} />
            </dl>
            <div className="mt-4 rounded-lg bg-page p-3 text-xs">
              <strong>sourceMemoryIds</strong>
              {memory.sourceMemoryIds.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {memory.sourceMemoryIds.map((sourceId) => (
                    <li key={sourceId} className="break-all">
                      {sourceId}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-muted">Doğrudan consolidation parent kaydı yok.</p>
              )}
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {memory.invalidatedAt === null ? (
                <MemoryInvalidateForm agentId={agent.id} memoryId={memory.id} />
              ) : (
                <div className="rounded-lg border p-3 text-sm text-muted">
                  Bu episode zaten aktif context dışında.
                </div>
              )}
              <MemoryForgetForm agentId={agent.id} memoryId={memory.id} />
            </div>
          </article>
        ))}
      </div>
      {memories.length === 0 ? (
        <p className="surface-card p-6 text-muted">Bu agent için hafıza kaydı yok.</p>
      ) : null}
      {totalItems > memories.length ? (
        <p className="mt-4 text-sm text-muted">En yeni 100 kayıt gösteriliyor.</p>
      ) : null}
    </ModerationLayout>
  );
}

function MemoryFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-bold text-muted">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}
