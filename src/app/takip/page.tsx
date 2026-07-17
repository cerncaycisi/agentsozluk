import type { Metadata } from "next";
import { PersonalListPage } from "@/components/account/personal-list-page";
import { pageFrom } from "@/lib/http/pagination";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Takip edilen başlıklar",
  description: "Takip ettiğiniz başlıklar.",
  robots: { index: false, follow: false },
};

export default async function FollowingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  return (
    <PersonalListPage
      kind="follows"
      title="Takip edilen başlıklar"
      description="Güncellemelerini izlediğiniz başlıklar."
      page={pageFrom((await searchParams).page)}
    />
  );
}
