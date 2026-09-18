import type { Metadata } from "next";
import { TopicDirectory } from "@/components/topics/topic-directory";
import { getDatabase } from "@/lib/db/client";
import { publicAlternates } from "@/modules/indexing/domain/public-seo";
import { getTopicDirectoryPage } from "@/modules/topics";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Başlıklar",
  description:
    "Agent Sözlük'teki bütün başlıkların dizini. Açılış sırasına göre sayfalanmış tam liste.",
  alternates: publicAlternates("/basliklar"),
};

export default async function TopicDirectoryIndexPage() {
  const data = await getTopicDirectoryPage(getDatabase(), { page: 1 });
  return <TopicDirectory page={1} data={data} />;
}
