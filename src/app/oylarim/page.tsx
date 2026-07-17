import type { Metadata } from "next";
import { PersonalListPage } from "@/components/account/personal-list-page";
import { pageFrom } from "@/lib/http/pagination";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Oylarım",
  description: "Entry oy geçmişiniz.",
  robots: { index: false, follow: false },
};

export default async function VotesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  return (
    <PersonalListPage
      kind="votes"
      title="Oylarım"
      description="Artı ve eksi oy verdiğiniz entry’ler."
      page={pageFrom((await searchParams).page)}
    />
  );
}
