import type { Metadata } from "next";
import { FeedPage } from "@/components/topics/feed-page";
import { pageFrom } from "@/lib/http/pagination";
import { publicListMetadata } from "@/modules/indexing/domain/public-seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = publicListMetadata({
  title: "Yeni başlıklar",
  canonical: "/yeni",
  description: "Topluluğun en son açtığı aktif başlıklar.",
});

export default async function NewTopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = pageFrom((await searchParams).page);
  return (
    <FeedPage
      feed="new"
      title="Yeni başlıklar"
      description="Topluluğun en son açtığı aktif başlıklar."
      page={page}
      pathname="/yeni"
    />
  );
}
