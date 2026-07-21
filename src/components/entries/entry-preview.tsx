import Link from "next/link";
import { EntryBody } from "@/components/entries/entry-body";
import { BlockedEntryBody } from "@/components/entries/blocked-entry-body";
import { EntryActions } from "@/components/entries/entry-actions";
import { formatIstanbulTimestamp } from "@/lib/format/time";

export interface EntryPreviewItem {
  id: string;
  body: string;
  score: number;
  createdAt: Date;
  status?: "ACTIVE" | "DELETED" | "HIDDEN";
  edited?: boolean;
  _count?: { revisions: number };
  topic: { id: string; title: string; slug: string };
  author: { id: string; username: string; displayName: string };
  blockedByViewer?: boolean;
}

export function EntryPreview({
  entry,
  actions,
  showTopicTitle = true,
}: {
  entry: EntryPreviewItem;
  showTopicTitle?: boolean;
  actions?: {
    vote: -1 | 1 | null;
    bookmarked: boolean;
    canEdit: boolean;
    canReport: boolean;
    canBlockAuthor: boolean;
  };
}) {
  const edited = entry.edited ?? (entry._count?.revisions ?? 0) > 0;
  const formattedCreatedAt = formatIstanbulTimestamp(entry.createdAt);
  return (
    <article id={`entry-${entry.id}`} className="surface-card scroll-mt-24 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {showTopicTitle ? (
          <h2 className="text-lg font-bold">
            <Link
              href={`/baslik/${entry.topic.id}-${entry.topic.slug}`}
              className="hover:text-primary"
            >
              {entry.topic.title}
            </Link>
          </h2>
        ) : null}
        {entry.status === "HIDDEN" ? (
          <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-bold text-destructive">
            gizlenmiş entry
          </span>
        ) : null}
      </div>
      <div className="mt-4">
        {entry.blockedByViewer ? (
          <BlockedEntryBody body={entry.body} />
        ) : (
          <EntryBody body={entry.body} />
        )}
      </div>
      <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm text-muted">
        <span>{entry.score} puan</span>
        <span>
          <Link
            href={`/entry/${entry.id}`}
            aria-label={`${formattedCreatedAt} tarihli entry’ye git`}
            className="hover:text-foreground hover:underline"
          >
            {formattedCreatedAt}
          </Link>
          {edited ? (
            <span className="ml-2 font-semibold" aria-label="Entry düzenlendi">
              · düzenlendi
            </span>
          ) : null}
        </span>
        <span>
          <Link
            href={`/yazar/${entry.author.username}`}
            className="font-semibold text-primary hover:underline"
          >
            {entry.author.displayName} · @{entry.author.username}
          </Link>
        </span>
      </footer>
      {actions ? (
        <EntryActions
          entryId={entry.id}
          body={entry.body}
          initialScore={entry.score}
          initialVote={actions.vote}
          initialBookmarked={actions.bookmarked}
          canEdit={actions.canEdit}
          authorId={entry.author.id}
          canReport={actions.canReport}
          canBlockAuthor={actions.canBlockAuthor}
          initialAuthorBlocked={Boolean(entry.blockedByViewer)}
        />
      ) : null}
    </article>
  );
}
