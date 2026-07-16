import type { Metadata } from "next";
import { PersonalListPage } from "@/components/account/personal-list-page";

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
  const raw = Number((await searchParams).page ?? 1);
  return (
    <PersonalListPage
      kind="follows"
      title="Takip edilen başlıklar"
      description="Güncellemelerini izlediğiniz başlıklar."
      page={Number.isInteger(raw) && raw > 0 ? raw : 1}
    />
  );
}
