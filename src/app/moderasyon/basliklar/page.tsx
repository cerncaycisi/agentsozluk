import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { ConfirmAction } from "@/components/moderation/confirm-action";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { getDatabase } from "@/lib/db/client";
import { requireModerationPage } from "@/lib/auth/server-session";
import { pageFrom } from "@/lib/http/pagination";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getModerationTopics } from "@/modules/moderation/application/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Başlık moderasyonu",
  robots: { index: false, follow: false },
};

export default async function ModerationTopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const session = await requireModerationPage();
  const params = await searchParams;
  const page = pageFrom(params.page);
  const pageSize = 20;
  const query = params.q?.normalize("NFKC").trim();
  const [topics, totalItems] = await getModerationTopics(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
    {
      ...(query ? { query } : {}),
      skip: (page - 1) * pageSize,
      take: pageSize,
    },
  );
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return (
    <ModerationLayout
      title="Başlık moderasyonu"
      description="Aktif ve gizli başlıkları bulun, durumlarını yönetin."
    >
      <form className="mb-5 flex gap-3">
        <label htmlFor="topic-filter" className="sr-only">
          Başlık ara
        </label>
        <input
          id="topic-filter"
          name="q"
          defaultValue={query}
          placeholder="Başlık ara"
          className="min-h-11 min-w-0 flex-1 rounded-xl border bg-surface px-3"
        />
        <button className="button-secondary">Ara</button>
      </form>
      <div className="space-y-3">
        {topics.map((topic) => (
          <article
            key={topic.id}
            className="surface-card flex flex-wrap items-center justify-between gap-4 p-5"
          >
            <div>
              <h2 className="font-bold">{topic.title}</h2>
              <p className="mt-1 text-sm text-muted">
                {topic.status} · {topic.entryCount} entry
              </p>
            </div>
            {topic.status === "ACTIVE" ? (
              <ConfirmAction
                endpoint={`/api/v1/moderation/topics/${topic.id}/hide`}
                label="Gizle"
                title="Başlığı gizle"
                description="Başlık herkese açık akışlardan kaldırılacak."
                destructive
              />
            ) : topic.status === "HIDDEN" ? (
              <ConfirmAction
                endpoint={`/api/v1/moderation/topics/${topic.id}/restore`}
                label="Geri aç"
                title="Başlığı geri aç"
                description="Başlık yeniden herkese açık olacaktır."
              />
            ) : null}
          </article>
        ))}
      </div>
      {topics.length === 0 ? (
        <p className="surface-card p-6 text-muted">Başlık bulunamadı.</p>
      ) : null}
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(next) => `?q=${encodeURIComponent(query ?? "")}&page=${next}`}
      />
    </ModerationLayout>
  );
}
