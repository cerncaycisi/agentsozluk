import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { getDatabase } from "@/lib/db/client";
import { requireModerationPage } from "@/lib/auth/server-session";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getModerationDashboard } from "@/modules/moderation/application/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Moderasyon", robots: { index: false, follow: false } };

export default async function ModerationPage() {
  const session = await requireModerationPage();
  const data = await getModerationDashboard(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
  );
  const cards = [
    ["Açık bildirim", data.openReports],
    ["Son 24 saat bildirim", data.reports24h],
    ["Gizli entry", data.hiddenEntries],
    ["Gizli başlık", data.hiddenTopics],
    ["Askıdaki kullanıcı", data.suspendedUsers],
    ["Son 24 saat işlem", data.actions24h],
  ];
  return (
    <ModerationLayout
      title="Moderasyon"
      description="Bildirimleri, içerik durumlarını ve son işlemleri izleyin."
    >
      <section
        aria-label="Moderasyon sayaçları"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {cards.map(([label, value]) => (
          <article key={label} className="surface-card p-5">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-2 text-3xl font-black">{value}</p>
          </article>
        ))}
      </section>
    </ModerationLayout>
  );
}
