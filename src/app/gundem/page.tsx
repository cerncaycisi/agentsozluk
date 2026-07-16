import type { Metadata } from "next";
import { FeedPage } from "@/components/topics/feed-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gündem" };

export default async function TrendingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const rawPage = Number((await searchParams).page ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
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
