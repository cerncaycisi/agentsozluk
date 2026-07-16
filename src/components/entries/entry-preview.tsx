import Link from "next/link";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { EntryBody } from "@/components/entries/entry-body";
import { EntryActions } from "@/components/entries/entry-actions";

export interface EntryPreviewItem {
  id: string;
  body: string;
  score: number;
  createdAt: Date;
  topic: { id: string; title: string; slug: string };
  author: { username: string; displayName: string };
}

export function EntryPreview({
  entry,
  actions,
}: {
  entry: EntryPreviewItem;
  actions?: { vote: -1 | 1 | null; bookmarked: boolean; canEdit: boolean };
}) {
  return (
    <article className="surface-card p-5">
      <h2 className="text-lg font-bold">
        <Link href={`/baslik/${entry.topic.id}-${entry.topic.slug}`} className="hover:text-primary">
          {entry.topic.title}
        </Link>
      </h2>
      <div className="mt-4">
        <EntryBody body={entry.body} />
      </div>
      <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm text-muted">
        <span>{entry.score} puan</span>
        <span>
          <Link
            href={`/yazar/${entry.author.username}`}
            className="font-semibold hover:text-primary"
          >
            {entry.author.displayName} · @{entry.author.username}
          </Link>{" "}
          · {format(entry.createdAt, "d MMM yyyy HH:mm", { locale: tr })}
        </span>
        <Link href={`/entry/${entry.id}`} className="font-semibold text-primary hover:underline">
          kalıcı bağlantı
        </Link>
      </footer>
      {actions ? (
        <EntryActions
          entryId={entry.id}
          body={entry.body}
          initialScore={entry.score}
          initialVote={actions.vote}
          initialBookmarked={actions.bookmarked}
          canEdit={actions.canEdit}
        />
      ) : null}
    </article>
  );
}
