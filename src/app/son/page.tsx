import type { Metadata } from "next";
import { FeedPage } from "@/components/topics/feed-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Son entry girilenler" };

export default async function RecentPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const rawPage = Number((await searchParams).page ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
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
