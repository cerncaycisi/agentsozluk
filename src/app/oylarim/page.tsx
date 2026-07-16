import type { Metadata } from "next";
import { PersonalListPage } from "@/components/account/personal-list-page";

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
  const raw = Number((await searchParams).page ?? 1);
  return (
    <PersonalListPage
      kind="votes"
      title="Oylarım"
      description="Artı ve eksi oy verdiğiniz entry’ler."
      page={Number.isInteger(raw) && raw > 0 ? raw : 1}
    />
  );
}
