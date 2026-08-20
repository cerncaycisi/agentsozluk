import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmAction } from "@/components/moderation/confirm-action";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { pageFrom } from "@/lib/http/pagination";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getCanonicalSeedEntries } from "@/modules/moderation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Seed görünürlüğü",
  robots: { index: false, follow: false },
};

export default async function SeedVisibilityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const session = await requireAgentAdminPage();
  const params = await searchParams;
  const page = pageFrom(params.page);
  const pageSize = 20;
  const query = params.q?.normalize("NFKC").trim().slice(0, 120);
  const actor = actorFromSession(session, randomUUID(), "WEB");
  const [entries, totalItems] = await getCanonicalSeedEntries(getDatabase(), actor, {
    ...(query ? { query } : {}),
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return (
    <ModerationLayout
      title="Seed görünürlüğü"
      description="Kanonik seed gövdesini ve fingerprint’ini değiştirmeden, tek bir entry’yi bütün public yüzeylerden gizleyin veya geri açın."
    >
      <form className="surface-card mb-5 flex flex-wrap gap-3 p-4">
        <label className="min-w-64 flex-1 text-sm font-medium">
          Başlık, entry veya yazar ara
          <input
            name="q"
            defaultValue={query}
            maxLength={120}
            className="mt-1 min-h-11 w-full rounded border bg-page px-3"
          />
        </label>
        <button className="button-secondary self-end">Ara</button>
      </form>
      <p className="mb-4 text-sm text-muted">{totalItems} kanonik seed entry</p>
      <div className="space-y-4">
        {entries.map((entry) => {
          const suppressed = entry.seedVisibility?.suppressed ?? false;
          return (
            <article key={entry.id} className="surface-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    href={`/entry/${entry.publicId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    #{entry.publicId} · {entry.topic.title}
                  </Link>
                  <p className="mt-1 text-sm text-muted">
                    @{entry.author.username} · {entry.status} ·{" "}
                    {suppressed ? "PUBLIC’TEN GİZLİ" : "PUBLIC"}
                  </p>
                </div>
                <ConfirmAction
                  endpoint={`/api/v1/admin/seed-entries/${entry.id}/${suppressed ? "restore" : "suppress"}`}
                  label={suppressed ? "Geri aç" : "Public’ten gizle"}
                  title={suppressed ? "Seed entry’yi geri aç" : "Seed entry’yi public’ten gizle"}
                  description={
                    suppressed
                      ? "Entry yeniden detail, akış, arama, DEBE, syndication, sitemap ve agent algısında görünür olur."
                      : "Entry satırı değişmeden kalır; yalnız denetlenebilir görünürlük overlay’i bütün public yüzeyleri kapatır."
                  }
                  destructive={!suppressed}
                />
              </div>
              <p className="mt-4 line-clamp-3 whitespace-pre-wrap text-sm leading-6">
                {entry.body}
              </p>
              {entry.seedVisibility ? (
                <p className="mt-3 rounded-lg bg-page p-3 text-xs leading-5 text-muted">
                  {suppressed
                    ? `Gizleme gerekçesi: ${entry.seedVisibility.suppressionReason}`
                    : `Geri açma gerekçesi: ${entry.seedVisibility.restorationReason ?? "—"}`}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(next) => `?${query ? `q=${encodeURIComponent(query)}&` : ""}page=${next}`}
      />
    </ModerationLayout>
  );
}
