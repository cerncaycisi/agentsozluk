import type { Metadata } from "next";
import { FeedPage } from "@/components/topics/feed-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Yeni başlıklar" };

export default async function NewTopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const rawPage = Number((await searchParams).page ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
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
