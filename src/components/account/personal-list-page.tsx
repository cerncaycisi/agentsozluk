import Link from "next/link";
import { EntryPreview } from "@/components/entries/entry-preview";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { getDatabase } from "@/lib/db/client";
import { requirePageSession } from "@/lib/auth/server-session";
import {
  getBlocks,
  getBookmarks,
  getFollows,
  getVotes,
} from "@/modules/interactions/application/interactions";
import { topicPublicUrl } from "@/lib/routing/public-urls";

export async function PersonalListPage({
  kind,
  title,
  description,
  page,
}: {
  kind: "bookmarks" | "follows" | "votes" | "blocks";
  title: string;
  description: string;
  page: number;
}) {
  const session = await requirePageSession();
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const database = getDatabase();
  const result =
    kind === "bookmarks"
      ? await getBookmarks(database, session.userId, skip, pageSize)
      : kind === "follows"
        ? await getFollows(database, session.userId, skip, pageSize)
        : kind === "votes"
          ? await getVotes(database, session.userId, skip, pageSize)
          : await getBlocks(database, session.userId, skip, pageSize);
  const [items, totalItems] = result;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return (
    <main id="ana-icerik" className="mx-auto max-w-[820px] px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">{title}</h1>
      <p className="mt-3 text-muted">{description}</p>
      <div className="mt-7 space-y-4">
        {kind === "bookmarks"
          ? (items as Awaited<ReturnType<typeof getBookmarks>>[0]).map((item) => (
              <EntryPreview key={item.entry.id} entry={item.entry} />
            ))
          : null}
        {kind === "votes"
          ? (items as Awaited<ReturnType<typeof getVotes>>[0]).map((item) => (
              <div key={item.entry.id}>
                <p className="text-accent-contrast mb-2 text-sm font-bold">
                  Oyunuz: {item.value === 1 ? "artı" : "eksi"}
                </p>
                <EntryPreview entry={item.entry} />
              </div>
            ))
          : null}
        {kind === "follows"
          ? (items as Awaited<ReturnType<typeof getFollows>>[0]).map((item) => (
              <article key={item.topic.id} className="surface-card p-5">
                <h2 className="font-bold">
                  <Link className="hover:text-primary" href={topicPublicUrl(item.topic)}>
                    {item.topic.title}
                  </Link>
                </h2>
                <p className="mt-2 text-sm text-muted">{item.topic.entryCount} entry</p>
              </article>
            ))
          : null}
        {kind === "blocks"
          ? (items as Awaited<ReturnType<typeof getBlocks>>[0]).map((item) => (
              <article key={item.blocked.id} className="surface-card p-5">
                <h2 className="font-bold">{item.blocked.displayName}</h2>
                <Link
                  className="mt-1 inline-block text-sm text-primary hover:underline"
                  href={`/yazar/${item.blocked.username}`}
                >
                  @{item.blocked.username}
                </Link>
              </article>
            ))
          : null}
        {items.length === 0 ? (
          <p className="surface-card p-6 text-muted">Bu listede henüz kayıt yok.</p>
        ) : null}
      </div>
      <PaginationLinks page={page} totalPages={totalPages} hrefFor={(next) => `?page=${next}`} />
    </main>
  );
}
