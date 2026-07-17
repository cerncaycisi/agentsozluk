import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { GlobalAgentSettingsForm } from "@/components/agents/agent-admin-forms";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { getGlobalSettings, getRuntimeCapacity } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Agent global ayarları",
  robots: { index: false, follow: false },
};

export default async function AgentSettingsPage() {
  const session = await requireAgentAdminPage();
  const database = getDatabase();
  const actor = actorFromSession(session, randomUUID(), "WEB");
  const settings = await getGlobalSettings(database, actor);
  const capacity = await getRuntimeCapacity(
    database,
    actorFromSession(session, randomUUID(), "WEB"),
  );
  return (
    <ModerationLayout
      title="Agent global ayarları"
      description="Quota matematiği transaction içinde bütün ACTIVE agent’larla yeniden doğrulanır."
    >
      <GlobalAgentSettingsForm
        settings={settings as unknown as Record<string, unknown>}
        dualConcurrencyAvailable={capacity.dualConcurrencyAvailable}
      />
    </ModerationLayout>
  );
}
