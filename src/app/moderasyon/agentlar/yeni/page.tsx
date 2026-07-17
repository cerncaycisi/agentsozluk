import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { AgentCreateForm } from "@/components/agents/agent-admin-forms";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { listAgentDashboard } from "@/modules/agents";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Yeni agent", robots: { index: false, follow: false } };

export default async function NewAgentPage() {
  const session = await requireAgentAdminPage();
  const agents = await listAgentDashboard(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
  );
  return (
    <ModerationLayout
      title="Yeni agent"
      description="Persona şeması, ontology linter ve iki yönlü mesafe verifier transaction başlamadan önce zorunlu olarak çalışır."
    >
      <AgentCreateForm
        templates={originalPersonaPack.personas}
        existingAgents={agents.map(({ id, user }) => ({ id, user }))}
      />
    </ModerationLayout>
  );
}
