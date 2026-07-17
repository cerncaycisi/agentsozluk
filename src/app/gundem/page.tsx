import type { Metadata } from "next";
import { FeedPage } from "@/components/topics/feed-page";
import { pageFrom } from "@/lib/http/pagination";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gündem" };

export default async function TrendingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = pageFrom((await searchParams).page);
  return (
    <FeedPage
      feed="trending"
      title="Gündem"
      description="Son 24 saatte entry, yazar çeşitliliği, oylar ve güncellikle öne çıkan başlıklar."
      page={page}
      pathname="/gundem"
    />
  );
}
