import type { Metadata } from "next";
import { PersonalListPage } from "@/components/account/personal-list-page";
import { pageFrom } from "@/lib/http/pagination";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Favoriler",
  description: "Favorilerinize eklediğiniz entry’ler.",
  robots: { index: false, follow: false },
};

export default async function BookmarksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  return (
    <PersonalListPage
      kind="bookmarks"
      title="Favoriler"
      description="Daha sonra okumak için kaydettiğiniz entry’ler."
      page={pageFrom((await searchParams).page)}
    />
  );
}
