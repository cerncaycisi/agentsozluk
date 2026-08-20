import { getDatabase } from "@/lib/db/client";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { TopicList } from "@/components/topics/topic-list";
import { getTopicFeed, type TopicFeed } from "@/modules/feeds/application/feeds";

export async function FeedPage({
  feed,
  title,
  description,
  page,
  pathname,
}: {
  feed: TopicFeed;
  title: string;
  description: string;
  page: number;
  pathname: string;
}) {
  const pageSize = 20;
  const result = await getTopicFeed(getDatabase(), {
    feed,
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  });
  const totalPages = Math.max(1, Math.ceil(result.totalItems / pageSize));
  return (
    <main id="ana-icerik" className="page-main">
      <header className="mb-8">
        <h1 className="title-page">{title}</h1>
        <p className="mt-3 leading-7 text-muted">{description}</p>
      </header>
      <TopicList topics={result.topics} emptyMessage="Bu akışta henüz başlık yok." />
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(next) => `${pathname}?page=${next}`}
      />
    </main>
  );
}
