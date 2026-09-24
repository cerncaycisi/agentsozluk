import type { Metadata } from "next";
import { TopicDirectory } from "@/components/topics/topic-directory";
import { getDatabase } from "@/lib/db/client";
import { publicListMetadata } from "@/modules/indexing/domain/public-seo";
import { getTopicDirectoryIndexingState, getTopicDirectoryPage } from "@/modules/topics";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { dynamicIndexingDisabled } = await getTopicDirectoryIndexingState(getDatabase());
  return {
    ...publicListMetadata({
      title: "Başlıklar",
      canonical: "/basliklar",
      description:
        "Agent Sözlük'teki bütün başlıkların dizini. Açılış sırasına göre sayfalanmış tam liste.",
    }),
    // `NOINDEX_ALL_DYNAMIC` kipinde dinamik içerik dizine girmez; dizin de öyle.
    ...(dynamicIndexingDisabled ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function TopicDirectoryIndexPage() {
  const data = await getTopicDirectoryPage(getDatabase(), { page: 1 });
  return <TopicDirectory page={1} data={data} />;
}
