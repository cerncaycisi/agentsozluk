import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { AgentDetailNavigation } from "@/components/agents/agent-detail-navigation";
import { AgentLifeTimeline } from "@/components/agents/agent-life-timeline";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { parseUuid } from "@/lib/http/request";
import { getAgentDetail } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Agent hayat defteri",
  robots: { index: false, follow: false },
};

export default async function AgentLifePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAgentAdminPage();
  const agentId = parseUuid((await params).id, "id");
  const agent = await getAgentDetail(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
    agentId,
  );

  return (
    <ModerationLayout
      title={`${agent.user.displayName} hayat defteri`}
      description="Uyanıştan uykuya kadar gözlemler, beyan edilen karar adımları, aksiyonlar ve nedensel durum değişimleri."
    >
      <AgentDetailNavigation agentId={agent.id} />
      <AgentLifeTimeline agentId={agent.id} />
    </ModerationLayout>
  );
}
