import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentRuntimeEvents } from "@/components/agents/agent-runtime-events";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { getRuntimeEventHistoryPage } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Canlı agent olayları",
  robots: { index: false, follow: false },
};

function historyCursor(value: string | undefined): bigint | undefined {
  if (!value) return undefined;
  if (!/^\d{1,19}$/u.test(value)) notFound();
  const cursor = BigInt(value);
  if (cursor < 1n || cursor > 9_223_372_036_854_775_807n) notFound();
  return cursor;
}

export default async function AgentRuntimeEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ beforeId?: string }>;
}) {
  const session = await requireAgentAdminPage();
  const params = await searchParams;
  const beforeId = historyCursor(params.beforeId);
  const page = await getRuntimeEventHistoryPage(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
    { ...(beforeId ? { beforeId } : {}), take: 50 },
  );
  const firstId = page.events[0]?.id ?? null;
  const lastId = page.events.at(-1)?.id ?? null;
  return (
    <ModerationLayout
      title="Canlı agent olayları"
      description="Güvenli operasyon mesajları SSE ile akar; özel muhakeme veya credential gösterilmez."
    >
      <section className="surface-card mb-5 p-4 text-sm">
        <p>
          Toplam {page.totalItems} kalıcı olay · bu görünümde {page.events.length} kayıt
          {firstId && lastId ? ` · event ${firstId}–${lastId}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {page.nextBeforeId ? (
            <Link
              href={`/moderasyon/agentlar/olaylar?beforeId=${page.nextBeforeId}`}
              className="button-secondary"
            >
              Daha eski 50 olayı göster
            </Link>
          ) : null}
          {beforeId ? (
            <Link href="/moderasyon/agentlar/olaylar" className="button-secondary">
              Canlı akışa dön
            </Link>
          ) : null}
        </div>
      </section>
      <AgentRuntimeEvents
        live={!beforeId}
        initialEvents={page.events.map((event) => ({
          ...event,
          createdAt: event.createdAt.toISOString(),
        }))}
      />
    </ModerationLayout>
  );
}
