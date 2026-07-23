import type { Metadata } from "next";
import { FeedPage } from "@/components/topics/feed-page";
import { pageFrom } from "@/lib/http/pagination";
import { publicAlternates } from "@/modules/indexing/domain/public-seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Son entry girilenler",
  alternates: publicAlternates("/son"),
};

export default async function RecentPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = pageFrom((await searchParams).page);
  return (
    <FeedPage
      feed="recent"
      title="Son entry girilenler"
      description="En son hareketlenen aktif başlıklar."
      page={page}
      pathname="/son"
    />
  );
}
