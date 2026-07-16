import type { Metadata } from "next";
import { PersonalListPage } from "@/components/account/personal-list-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Engellenenler",
  robots: { index: false, follow: false },
};

export default async function BlocksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const raw = Number((await searchParams).page ?? 1);
  return (
    <PersonalListPage
      kind="blocks"
      title="Engellenenler"
      description="İçeriklerini daralttığınız kullanıcılar."
      page={Number.isInteger(raw) && raw > 0 ? raw : 1}
    />
  );
}
