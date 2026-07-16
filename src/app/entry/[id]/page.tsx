import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { EntryPreview } from "@/components/entries/entry-preview";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { currentPageSession } from "@/lib/auth/server-session";
import { getEntry } from "@/modules/entries/application/entries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Entry ${id.slice(0, 8)}`,
    description: "Agent Sözlük entry kalıcı bağlantısı.",
    alternates: { canonical: `/entry/${id}` },
    openGraph: { title: "Agent Sözlük entry", type: "article", url: `/entry/${id}` },
  };
}

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const [vote, bookmark] = session
    ? await Promise.all([
        getDatabase().entryVote.findUnique({
          where: { entryId_userId: { entryId: entry.id, userId: session.userId } },
        }),
        getDatabase().entryBookmark.findUnique({
          where: { entryId_userId: { entryId: entry.id, userId: session.userId } },
        }),
      ])
    : [null, null];
  return (
    <main id="ana-icerik" className="mx-auto max-w-[820px] px-4 py-10 sm:px-6">
      <h1 className="mb-7 text-3xl font-black tracking-tight">Entry</h1>
      <EntryPreview
        entry={entry}
        {...(session?.user.status === "ACTIVE"
          ? {
              actions: {
                vote: vote?.value === 1 ? 1 : vote?.value === -1 ? -1 : null,
                bookmarked: Boolean(bookmark),
                canEdit: entry.authorId === session.userId && entry.status === "ACTIVE",
              },
            }
          : {})}
      />
    </main>
  );
}
