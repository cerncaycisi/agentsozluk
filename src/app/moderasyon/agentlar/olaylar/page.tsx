import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { AgentRuntimeEvents } from "@/components/agents/agent-runtime-events";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { listRuntimeEvents } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Canlı agent olayları",
  robots: { index: false, follow: false },
};

export default async function AgentRuntimeEventsPage() {
  const session = await requireAgentAdminPage();
  const events = await listRuntimeEvents(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
    { take: 50 },
  );
  return (
    <ModerationLayout
      title="Canlı agent olayları"
      description="Güvenli operasyon mesajları SSE ile akar; özel muhakeme veya credential gösterilmez."
    >
      <AgentRuntimeEvents
        initialEvents={events.map((event) => ({
          ...event,
          createdAt: event.createdAt.toISOString(),
        }))}
      />
    </ModerationLayout>
  );
}
