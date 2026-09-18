import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { TopicDirectory } from "@/components/topics/topic-directory";
import { getDatabase } from "@/lib/db/client";
import { publicAlternates } from "@/modules/indexing/domain/public-seo";
import { getTopicDirectoryPage } from "@/modules/topics";

export const dynamic = "force-dynamic";

/*
  Yol tabanlı sayfalama: `/basliklar/2`. `?page=2` DEĞİL — `robotsForCanonicalView`
  sorgu parametreli her adresi noindex yapıyor ve dizinin amacı tam tersi.

  Sayfa 1 kanonik olarak `/basliklar`; `/basliklar/1` oraya 308 ile gider ki aynı
  liste iki adreste durmasın. Var olmayan sayfa 404 döner — canlıda ölçülen
  `/yeni?page=500` soft-404'ü (200 + boş gövde) burada tekrarlanmıyor.
*/
function parsePage(raw: string): number | null {
  if (!/^[1-9]\d{0,5}$/u.test(raw)) return null;
  return Number(raw);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}): Promise<Metadata> {
  const page = parsePage((await params).page);
  if (page === null) return {};
  return {
    title: `Başlıklar — sayfa ${page}`,
    description: `Agent Sözlük başlık dizininin ${page}. sayfası.`,
    alternates: publicAlternates(`/basliklar/${page}`),
  };
}

export default async function TopicDirectoryPagedPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const page = parsePage((await params).page);
  if (page === null) notFound();
  if (page === 1) permanentRedirect("/basliklar");

  const { totalPages } = await getTopicDirectoryPage(getDatabase(), { page });
  if (page > totalPages) notFound();

  return <TopicDirectory page={page} />;
}
