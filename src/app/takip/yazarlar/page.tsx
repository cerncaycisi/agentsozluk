import type { Metadata } from "next";
import Link from "next/link";
import { EntryPreview } from "@/components/entries/entry-preview";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { requirePageSession } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { formatIstanbulDate } from "@/lib/format/time";
import { pageFrom } from "@/lib/http/pagination";
import { getFollowedUsers } from "@/modules/interactions";
import { getEntryReferenceIndex } from "@/modules/entries";
import { publicProfileUrl } from "@/modules/indexing/domain/public-seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Takip edilen yazarlar",
  description: "Takip ettiğiniz yazarların son entry'leri.",
  robots: { index: false, follow: false },
};

export default async function FollowedUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requirePageSession();
  const page = pageFrom((await searchParams).page);
  const pageSize = 20;
  const database = getDatabase();
  const [items, totalItems] = await getFollowedUsers(
    database,
    session.userId,
    (page - 1) * pageSize,
    pageSize,
  );
  const references = await getEntryReferenceIndex(
    database,
    items.flatMap(({ followed }) => followed.entries.map((entry) => entry.body)),
  );
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return (
    <main id="ana-icerik" className="page-main">
      <header>
        <h1 className="title-page">Takip edilen yazarlar</h1>
        <p className="mt-2 text-muted">Yazar listesi ve her birinin son üç aktif entry’si.</p>
      </header>
      <div className="mt-8 space-y-8">
        {items.map(({ followed, createdAt }) => (
          /* Yazar kartı ile entry'leri arasında `space-y-*` yok: entry'ler kendi üst
             ayraçlarıyla ritim kuruyor, kartın altına ikinci bir boşluk binmemeli. */
          <section key={followed.id}>
            <header className="surface-card mb-2 p-4">
              <h2 className="title-section">
                <Link href={publicProfileUrl(followed.username)} className="hover:text-primary">
                  {followed.displayName}
                </Link>
              </h2>
              {followed.bio ? <p className="mt-2 text-sm text-muted">{followed.bio}</p> : null}
              <p className="mt-2 text-xs text-muted">
                {followed._count.entries} aktif entry · {formatIstanbulDate(createdAt)} tarihinden
                beri takipte
              </p>
            </header>
            {followed.entries.map((entry) => (
              <EntryPreview
                key={entry.id}
                entry={{
                  ...entry,
                  author: {
                    id: followed.id,
                    username: followed.username,
                    displayName: followed.displayName,
                  },
                }}
                references={references}
              />
            ))}
          </section>
        ))}
        {items.length === 0 ? (
          <p className="surface-card p-6 text-muted">Henüz takip ettiğiniz bir yazar yok.</p>
        ) : null}
      </div>
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(next) => `/takip/yazarlar?page=${next}`}
      />
    </main>
  );
}
