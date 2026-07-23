import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { EntryPreview } from "@/components/entries/entry-preview";
import { JsonLd } from "@/components/seo/json-ld";
import { APP_NAME } from "@/config/app";
import { getEnvironment } from "@/config/env";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import {
  entryPublicUrl,
  parseEntryRouteReference,
  topicEntryAnchorUrl,
  topicPublicUrl,
} from "@/lib/routing/public-urls";
import { currentPageSession } from "@/lib/auth/server-session";
import { getEntry, getEntryByPublicId } from "@/modules/entries/application/entries";
import { getEntryIndexingDecision } from "@/modules/indexing";
import {
  buildEntryJsonLd,
  publicAlternates,
  publicExcerpt,
  publicProfileUrl,
} from "@/modules/indexing/domain/public-seo";
import { getViewerEntryStates } from "@/modules/interactions/application/interactions";
import Link from "next/link";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: rawId } = await params;
  const reference = parseEntryRouteReference(rawId);
  if (!reference) return { title: "Entry bulunamadı", robots: { index: false, follow: false } };
  try {
    const entry =
      reference.kind === "public"
        ? await getEntryByPublicId(getDatabase(), reference.publicId, null)
        : await getEntry(getDatabase(), reference.id, null);
    const indexing = await getEntryIndexingDecision(getDatabase(), entry.id);
    const canonical = entryPublicUrl(entry);
    const title = `${entry.topic.title} · @${entry.author.username}`;
    const description = publicExcerpt(entry.body);
    return {
      title,
      description,
      alternates: publicAlternates(canonical),
      openGraph: {
        title: `${title} · ${APP_NAME}`,
        description,
        type: "article",
        url: canonical,
        publishedTime: entry.createdAt.toISOString(),
        modifiedTime: entry.updatedAt.toISOString(),
        authors: [publicProfileUrl(entry.author.username)],
      },
      robots: { index: indexing.index, follow: indexing.follow },
    };
  } catch {
    return { title: "Entry bulunamadı", robots: { index: false, follow: false } };
  }
}

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const reference = parseEntryRouteReference(rawId);
  if (!reference) notFound();
  const session = await currentPageSession();
  const viewer = session
    ? { userId: session.userId, role: session.user.role, status: session.user.status }
    : null;
  let entry;
  try {
    entry =
      reference.kind === "public"
        ? await getEntryByPublicId(getDatabase(), reference.publicId, viewer)
        : await getEntry(getDatabase(), reference.id, viewer);
  } catch (error) {
    if (error instanceof AppError && error.code === "ENTRY_NOT_FOUND") notFound();
    throw error;
  }
  if ("canonicalTopic" in entry && entry.canonicalTopic)
    permanentRedirect(topicPublicUrl(entry.canonicalTopic));
  if (reference.kind === "legacy") permanentRedirect(entryPublicUrl(entry));
  const [votes, bookmarks] = session
    ? await getViewerEntryStates(getDatabase(), session.userId, [entry.id])
    : [[], []];
  const vote = votes[0];
  const bookmark = bookmarks[0];
  const topicAnchor = topicEntryAnchorUrl({ topic: entry.topic, entry });
  return (
    <main id="ana-icerik" className="mx-auto max-w-[820px] px-4 py-10 sm:px-6">
      <JsonLd
        data={buildEntryJsonLd({
          baseUrl: getEnvironment().APP_URL,
          url: entryPublicUrl(entry),
          topicUrl: topicPublicUrl(entry.topic),
          topicTitle: entry.topic.title,
          body: entry.body,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
          author: entry.author,
        })}
      />
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
