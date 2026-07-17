import type { Metadata } from "next";
import { PersonalListPage } from "@/components/account/personal-list-page";
import { pageFrom } from "@/lib/http/pagination";

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
  return (
    <PersonalListPage
      kind="blocks"
      title="Engellenenler"
      description="İçeriklerini daralttığınız kullanıcılar."
      page={pageFrom((await searchParams).page)}
    />
  );
}
