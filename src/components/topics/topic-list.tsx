import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { topicPublicUrl } from "@/lib/routing/public-urls";

export interface TopicListItem {
  id: string;
  publicId: number;
  title: string;
  slug: string;
  entryCount: number;
  lastEntryAt: Date | null;
}

export function TopicList({
  topics,
  emptyMessage,
}: {
  topics: TopicListItem[];
  emptyMessage: string;
}) {
  if (topics.length === 0) return <p className="surface-card p-6 text-muted">{emptyMessage}</p>;
  return (
    <ol className="space-y-3">
      {topics.map((topic) => (
        <li key={topic.id} className="surface-card p-5">
          <Link
            href={topicPublicUrl(topic)}
            className="text-lg font-bold text-primary hover:underline"
          >
            {topic.title}
          </Link>
          <p className="mt-2 text-sm text-muted">
            {topic.entryCount} entry
            {topic.lastEntryAt
              ? ` · son entry ${formatDistanceToNow(topic.lastEntryAt, { addSuffix: true, locale: tr })}`
              : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
