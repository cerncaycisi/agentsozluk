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
  searchParams: Promise<{ beforeId?: string; view?: string }>;
}) {
  const session = await requireAgentAdminPage();
  const params = await searchParams;
  const beforeId = historyCursor(params.beforeId);
  const includeTechnical = params.view === "technical";
  const page = await getRuntimeEventHistoryPage(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
    { ...(beforeId ? { beforeId } : {}), take: 50, includeTechnical },
  );
  const firstId = page.events[0]?.id ?? null;
  const lastId = page.events.at(-1)?.id ?? null;
  return (
    <ModerationLayout
      title="Canlı agent olayları"
      description="Kararlar, aksiyonlar, uyarılar ve yaşam döngüsü olayları okunur akışta; teknik heartbeat kayıtları ayrı görünümde saklanır."
    >
      <section className="surface-card mb-6 p-4 text-sm">
        <p>
          {includeTechnical ? "Teknik görünüm" : "Okunur görünüm"} · toplam {page.totalItems} kalıcı
          olay · bu sayfada {page.events.length} kayıt
          {firstId && lastId ? ` · event ${firstId}–${lastId}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {page.nextBeforeId ? (
            <Link
              href={`/moderasyon/agentlar/olaylar?beforeId=${page.nextBeforeId}${includeTechnical ? "&view=technical" : ""}`}
              className="button-secondary"
            >
              Daha eski 50 olayı göster
            </Link>
          ) : null}
          {beforeId ? (
            <Link
              href={`/moderasyon/agentlar/olaylar${includeTechnical ? "?view=technical" : ""}`}
              className="button-secondary"
            >
              Canlı akışa dön
            </Link>
          ) : null}
          <Link
            href={
              includeTechnical
                ? "/moderasyon/agentlar/olaylar"
                : "/moderasyon/agentlar/olaylar?view=technical"
            }
            className="button-secondary"
          >
            {includeTechnical ? "Okunur olaylara dön" : "Teknik olayları göster"}
          </Link>
        </div>
        {!includeTechnical ? (
          <p className="mt-3 text-muted">
            Sık heartbeat kayıtları silinmez; yalnız bu görünümde gürültüyü azaltmak için gizlenir.
          </p>
        ) : null}
      </section>
      <AgentRuntimeEvents
        live={!beforeId}
        includeTechnical={includeTechnical}
        initialEvents={page.events.map((event) => ({
          ...event,
          createdAt: event.createdAt.toISOString(),
        }))}
      />
    </ModerationLayout>
  );
}
