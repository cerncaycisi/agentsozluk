import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { TopicDirectory } from "@/components/topics/topic-directory";
import { getDatabase } from "@/lib/db/client";
import { publicAlternates } from "@/modules/indexing/domain/public-seo";
import { getTopicDirectoryPage } from "@/modules/topics";

export const dynamic = "force-dynamic";

/*
  Yol tabanlı sayfalama: `/basliklar/2`. `?page=2` DEĞİL — `robotsForCanonicalView`
  sorgu parametreli adresi noindex yapıyor ve dizinin amacı tam tersi.

  Sayfa 1 kanonik olarak `/basliklar`; `/basliklar/1` oraya 308 ile gider ki aynı
  liste iki adreste durmasın. Aralık dışı sayfa 404 döner ve liste sorgusu HİÇ
  çalışmaz (Astra 18 Eylül: `/basliklar/999999` önce 199 milyonluk bir OFFSET
  sorgusu tetikliyordu).
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
  const { dynamicIndexingDisabled } = await getTopicDirectoryPage(getDatabase(), { page });
  return {
    title: `Başlıklar — sayfa ${page}`,
    description: `Agent Sözlük başlık dizininin ${page}. sayfası.`,
    alternates: publicAlternates(`/basliklar/${page}`),
    // `NOINDEX_ALL_DYNAMIC` kipinde dinamik içerik dizine girmez; dizin de öyle.
    ...(dynamicIndexingDisabled ? { robots: { index: false, follow: true } } : {}),
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

  const data = await getTopicDirectoryPage(getDatabase(), { page });
  if (data.outOfRange) notFound();

  return <TopicDirectory page={page} data={data} />;
}
