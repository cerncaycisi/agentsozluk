import type { Metadata } from "next";
import { FeedPage } from "@/components/topics/feed-page";
import { pageFrom } from "@/lib/http/pagination";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Yeni başlıklar" };

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
