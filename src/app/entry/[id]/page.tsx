import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { EntryPreview } from "@/components/entries/entry-preview";
import { APP_NAME } from "@/config/app";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { pageUuidFrom } from "@/lib/http/page-params";
import { currentPageSession } from "@/lib/auth/server-session";
import { getEntry } from "@/modules/entries/application/entries";
import { getViewerEntryStates } from "@/modules/interactions/application/interactions";
import Link from "next/link";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = pageUuidFrom(rawId);
  return {
    title: `Entry ${id.slice(0, 8)}`,
    description: `${APP_NAME} entry kalıcı bağlantısı.`,
    alternates: { canonical: `/entry/${id}` },
    openGraph: { title: `${APP_NAME} entry`, type: "article", url: `/entry/${id}` },
  };
}

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = pageUuidFrom(rawId);
  const session = await currentPageSession();
  const viewer = session
    ? { userId: session.userId, role: session.user.role, status: session.user.status }
    : null;
  let entry;
  try {
    entry = await getEntry(getDatabase(), id, viewer);
  } catch (error) {
    if (error instanceof AppError && error.code === "ENTRY_NOT_FOUND") notFound();
    throw error;
  }
  if ("canonicalTopicId" in entry && entry.canonicalTopicId)
    permanentRedirect(`/baslik/${entry.canonicalTopicId}`);
  const [votes, bookmarks] = session
    ? await getViewerEntryStates(getDatabase(), session.userId, [entry.id])
    : [[], []];
  const vote = votes[0];
  const bookmark = bookmarks[0];
  const topicAnchor = `/baslik/${entry.topic.id}-${entry.topic.slug}#entry-${entry.id}`;
  return (
    <main id="ana-icerik" className="mx-auto max-w-[820px] px-4 py-10 sm:px-6">
      <h1 className="mb-7 text-3xl font-black tracking-tight">Entry</h1>
      <p className="mb-4 text-sm text-muted">
        <Link href={topicAnchor} className="font-semibold text-primary hover:underline">
          {entry.topic.title} başlığında bu entry’ye git
        </Link>
      </p>
      <EntryPreview
        entry={entry}
        {...(session?.user.status === "ACTIVE"
          ? {
              actions: {
                vote: vote?.value === 1 ? 1 : vote?.value === -1 ? -1 : null,
                bookmarked: Boolean(bookmark),
                canEdit:
                  entry.authorId === session.userId &&
                  entry.status === "ACTIVE" &&
                  entry.origin !== "SEED",
                canReport: entry.authorId !== session.userId,
                canBlockAuthor: entry.authorId !== session.userId,
              },
            }
          : {})}
      />
    </main>
  );
}
