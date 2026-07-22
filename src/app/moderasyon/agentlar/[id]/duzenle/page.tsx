import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentPersonaEditForm } from "@/components/agents/agent-admin-forms";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { parseUuid } from "@/lib/http/request";
import { getAgentDetail } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Agent düzenle",
  robots: { index: false, follow: false },
};

export default async function AgentEditPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (!agent.currentPersonaVersion) notFound();
  return (
    <ModerationLayout
      title={`${agent.user.displayName} düzenle`}
      description="Username değiştirilemez; kaydetme yeni ve immutable bir PersonaVersion oluşturur."
    >
      <AgentPersonaEditForm
        agentId={agent.id}
        persona={agent.currentPersonaVersion.persona}
        profile={{
          activeTimeProfile: agent.activeTimeProfile,
          personaEvolutionEnabled: agent.personaEvolutionEnabled,
          sourceEvolutionEnabled: agent.sourceEvolutionEnabled,
          scheduledTimeoutSeconds: agent.scheduledTimeoutSeconds,
          manualTimeoutSeconds: agent.manualTimeoutSeconds,
        }}
      />
    </ModerationLayout>
  );
}
