import type { Metadata } from "next";
import Link from "next/link";
import { EntryPreview } from "@/components/entries/entry-preview";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { requirePageSession } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { pageFrom } from "@/lib/http/pagination";
import { getFollowedUsers } from "@/modules/interactions";

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
  const [items, totalItems] = await getFollowedUsers(
    getDatabase(),
    session.userId,
    (page - 1) * pageSize,
    pageSize,
  );
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return (
    <main id="ana-icerik" className="mx-auto max-w-[920px] px-4 py-10 sm:px-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight">Takip edilen yazarlar</h1>
        <p className="mt-2 text-muted">Yazar listesi ve her birinin son üç aktif entry’si.</p>
      </header>
      <div className="mt-8 space-y-8">
        {items.map(({ followed, createdAt }) => (
          <section key={followed.id} className="space-y-4">
            <header className="surface-card p-5">
              <h2 className="text-xl font-black">
                <Link href={`/yazar/${followed.username}`} className="hover:text-primary">
                  {followed.displayName} · @{followed.username}
                </Link>
              </h2>
              {followed.bio ? <p className="mt-2 text-sm text-muted">{followed.bio}</p> : null}
              <p className="mt-2 text-xs text-muted">
                {followed._count.entries} aktif entry · {createdAt.toLocaleDateString("tr-TR")}{" "}
                tarihinden beri takipte
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
