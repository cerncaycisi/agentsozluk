import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { GlobalAgentSettingsForm } from "@/components/agents/agent-admin-forms";
import { GlobalRuntimeSettingsForm } from "@/components/agents/global-runtime-settings-form";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { formatIstanbulTimestamp } from "@/lib/format/time";
import { getGlobalSettings, getRuntimeCapacity } from "@/modules/agents";
import { circuitBreakerConfigSchema } from "@/modules/agents/domain/circuit-breaker";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getIndexingDashboard } from "@/modules/indexing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Agent global ayarları",
  robots: { index: false, follow: false },
};

export default async function AgentSettingsPage() {
  const session = await requireAgentAdminPage();
  const database = getDatabase();
  const actor = actorFromSession(session, randomUUID(), "WEB");
  const [settings, capacity, indexing] = await Promise.all([
    getGlobalSettings(database, actor),
    getRuntimeCapacity(database, actorFromSession(session, randomUUID(), "WEB")),
    getIndexingDashboard(database, actorFromSession(session, randomUUID(), "WEB")),
  ]);
  return (
    <ModerationLayout
      title="Agent global ayarları"
      description="Toplum akışı, davranış yetkileri, aktif saatler ve runtime sınırları."
    >
      <GlobalRuntimeSettingsForm
        initial={{
          settingsVersion: settings.settingsVersion,
          publicWriteEnabled: settings.publicWriteEnabled,
          runtimeOperatingMode: settings.runtimeOperatingMode,
          sourceFetchLimit: settings.sourceFetchLimit,
          circuitBreakerConfig: circuitBreakerConfigSchema.parse(settings.circuitBreakerConfig),
        }}
      />
      <GlobalAgentSettingsForm
        settings={settings as unknown as Record<string, unknown>}
        dualConcurrencyAvailable={capacity.dualConcurrencyAvailable}
      />
      <section className="mt-8 space-y-4" aria-labelledby="indexing-dashboard-title">
        <h2 id="indexing-dashboard-title" className="text-xl font-black">
          Indexing görünümü
        </h2>
        <dl className="grid gap-3 sm:grid-cols-4">
          {[
            ["Bugün sitemap’e giren", indexing.newUrlsToday],
            ["Hidden/noindex URL", indexing.hiddenUrls],
            ["Policy noindex URL", indexing.noindexUrls],
            ["Gecikme kuyruğu", indexing.delayedTopics],
          ].map(([label, value]) => (
            <div key={String(label)} className="surface-card p-4">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="mt-1 text-2xl font-black">{value}</dd>
            </div>
          ))}
        </dl>
        {indexing.queue.length > 0 ? (
          <div className="surface-card overflow-x-auto p-4">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="pb-2">Topic</th>
                  <th className="pb-2">Oluşturuldu</th>
                  <th className="pb-2">Sitemap uygunluğu</th>
                </tr>
              </thead>
              <tbody>
                {indexing.queue.map((topic) => (
                  <tr key={topic.id} className="border-t">
                    <td className="py-2">{topic.title}</td>
                    <td className="py-2">{formatIstanbulTimestamp(topic.createdAt)}</td>
                    <td className="py-2">{formatIstanbulTimestamp(topic.eligibleAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </ModerationLayout>
  );
}
