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
import { getEntryReferenceIndex } from "@/modules/entries";
import { publicProfileUrl } from "@/modules/indexing/domain/public-seo";

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
  const references = await getEntryReferenceIndex(
    database,
    kind === "bookmarks"
      ? (items as Awaited<ReturnType<typeof getBookmarks>>[0]).map((item) => item.entry.body)
      : kind === "votes"
        ? (items as Awaited<ReturnType<typeof getVotes>>[0]).map((item) => item.entry.body)
        : [],
  );
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return (
    <main id="ana-icerik" className="page-main">
      <h1 className="title-page">{title}</h1>
      <p className="mt-3 text-muted">{description}</p>
      {/*
        Entry listeleri ritmini `EntryPreview`'ın üst ayracından alıyor; sarmalayıcıda
        `space-y-*` YOK, yoksa ayracın boşluğu ikiye katlanır. Başlık/yazar kartları
        (follows, blocks) ayraç taşımıyor, onlar kendi aralıklarını kuruyor.
      */}
      <div className="mt-7">
        {kind === "bookmarks"
          ? (items as Awaited<ReturnType<typeof getBookmarks>>[0]).map((item) => (
              <EntryPreview key={item.entry.id} entry={item.entry} references={references} />
            ))
          : null}
        {kind === "votes"
          ? (items as Awaited<ReturnType<typeof getVotes>>[0]).map((item) => (
              /* Ayraç dıştaki kutuda: "Oyunuz" etiketi çizginin ALTINDA, entry'yle
                 aynı bloğun içinde kalmalı. Ayraç entry'de kalsa çizgi etiketle
                 gövdenin arasına düşerdi. */
              <div key={item.entry.id} className="border-t py-4">
                <p className="eyebrow mb-2">Oyunuz: {item.value === 1 ? "artı" : "eksi"}</p>
                <EntryPreview entry={item.entry} references={references} divider={false} />
              </div>
            ))
          : null}
        {kind === "follows" ? (
          <div className="space-y-4">
            {(items as Awaited<ReturnType<typeof getFollows>>[0]).map((item) => (
              <article key={item.topic.id} className="surface-card p-5">
                <h2 className="title-item">
                  <Link className="hover:text-primary" href={topicPublicUrl(item.topic)}>
                    {item.topic.title}
                  </Link>
                </h2>
                <p className="mt-2 text-sm text-muted">{item.topic.entryCount} entry</p>
              </article>
            ))}
          </div>
        ) : null}
        {kind === "blocks" ? (
          <div className="space-y-4">
            {(items as Awaited<ReturnType<typeof getBlocks>>[0]).map((item) => (
              <article key={item.blocked.id} className="surface-card p-5">
                <h2 className="title-item">{item.blocked.displayName}</h2>
                <Link
                  className="mt-1 inline-block text-sm text-primary hover:underline"
                  href={publicProfileUrl(item.blocked.username)}
                >
                  Profili aç
                </Link>
              </article>
            ))}
          </div>
        ) : null}
        {items.length === 0 ? (
          <p className="surface-card p-6 text-muted">Bu listede henüz kayıt yok.</p>
        ) : null}
      </div>
      <PaginationLinks page={page} totalPages={totalPages} hrefFor={(next) => `?page=${next}`} />
    </main>
  );
}
