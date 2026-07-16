import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { CreateEntryForm } from "@/components/entries/create-entry-form";
import { EntryPreview } from "@/components/entries/entry-preview";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { currentPageSession } from "@/lib/auth/server-session";
import { getTopicEntries } from "@/modules/entries/application/entries";
import { getTopic } from "@/modules/topics/application/topics";
import { TopicFollowButton } from "@/components/topics/topic-follow-button";

export const dynamic = "force-dynamic";

function topicIdFrom(segment: string): string {
  const id = segment.slice(0, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id))
    notFound();
  return id;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topic: string }>;
}): Promise<Metadata> {
  const { topic: segment } = await params;
  try {
    const topic = await getTopic(getDatabase(), topicIdFrom(segment), null);
    return {
      title: topic.title,
      description: `${topic.title} başlığındaki entry’leri okuyun ve tartışmaya katılın.`,
      alternates: { canonical: topic.url },
      openGraph: {
        title: topic.title,
        description: `${topic.entryCount} aktif entry`,
        url: topic.url,
        type: "article",
      },
    };
  } catch {
    return { title: "Başlık bulunamadı", robots: { index: false, follow: false } };
  }
}

export default async function TopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ topic: string }>;
  searchParams: Promise<{ page?: string; sort?: string }>;
}) {
  const { topic: segment } = await params;
  const topicId = topicIdFrom(segment);
  const session = await currentPageSession();
  const viewer = session
    ? { userId: session.userId, role: session.user.role, status: session.user.status }
    : null;
  let topic;
  try {
    topic = await getTopic(getDatabase(), topicId, viewer);
  } catch (error) {
    if (error instanceof AppError && error.code === "TOPIC_MERGED") {
      const canonical = error.details?.canonicalTopic;
      if (
        canonical &&
        typeof canonical === "object" &&
        "url" in canonical &&
        typeof canonical.url === "string"
      )
        permanentRedirect(canonical.url);
    }
    if (error instanceof AppError && error.code === "TOPIC_NOT_FOUND") notFound();
    throw error;
  }
  const canonicalSegment = `${topic.id}-${topic.slug}`;
  if (segment !== canonicalSegment) permanentRedirect(topic.url);
  const query = await searchParams;
  const rawPage = Number(query.page ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const sort = query.sort === "newest" || query.sort === "top" ? query.sort : "oldest";
  const pageSize = 20;
  const result = await getTopicEntries(getDatabase(), {
    topicId,
    viewer,
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    sort,
  });
  const entryIds = result.entries.map((entry) => entry.id);
  const [votes, bookmarks] =
    session && entryIds.length > 0
      ? await Promise.all([
          getDatabase().entryVote.findMany({
            where: { userId: session.userId, entryId: { in: entryIds } },
            select: { entryId: true, value: true },
          }),
          getDatabase().entryBookmark.findMany({
            where: { userId: session.userId, entryId: { in: entryIds } },
            select: { entryId: true },
          }),
        ])
      : [[], []];
  const voteMap = new Map(
    votes.map((vote) => [vote.entryId, vote.value === 1 ? (1 as const) : (-1 as const)]),
  );
  const bookmarkSet = new Set(bookmarks.map((bookmark) => bookmark.entryId));
  const totalPages = Math.max(1, Math.ceil(result.totalItems / pageSize));
  return (
    <main id="ana-icerik" className="mx-auto max-w-[820px] px-4 py-10 sm:px-6">
      <header className="mb-7">
        <p className="text-accent-contrast text-sm font-bold">{topic.entryCount} entry</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">{topic.title}</h1>
        <nav aria-label="Entry sıralaması" className="mt-4 flex gap-2">
          {(["oldest", "newest", "top"] as const).map((value) => (
            <a
              key={value}
              href={`${topic.url}?sort=${value}`}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${sort === value ? "bg-primary text-white" : "bg-surface"}`}
            >
              {value === "oldest"
                ? "Eskiden yeniye"
                : value === "newest"
                  ? "Yeniden eskiye"
                  : "En yüksek puan"}
            </a>
          ))}
        </nav>
        {session?.user.status === "ACTIVE" ? (
          <div className="mt-5">
            <TopicFollowButton topicId={topicId} initialFollowed={topic.following} />
          </div>
        ) : null}
      </header>
      <div className="space-y-4">
        {result.entries.map((entry) => (
          <EntryPreview
            key={entry.id}
            entry={entry}
            {...(session?.user.status === "ACTIVE"
              ? {
                  actions: {
                    vote: voteMap.get(entry.id) ?? null,
                    bookmarked: bookmarkSet.has(entry.id),
                    canEdit: entry.authorId === session.userId && entry.status === "ACTIVE",
                  },
                }
              : {})}
          />
        ))}
        {result.entries.length === 0 ? (
          <p className="surface-card p-6 text-muted">Bu başlıkta görüntülenebilen entry yok.</p>
        ) : null}
      </div>
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(next) => `${topic.url}?sort=${sort}&page=${next}`}
      />
      {session?.user.status === "ACTIVE" ? <CreateEntryForm topicId={topicId} /> : null}
    </main>
  );
}
