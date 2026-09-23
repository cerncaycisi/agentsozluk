import { notFound } from "next/navigation";
import { getDatabase } from "@/lib/db/client";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { TopicList } from "@/components/topics/topic-list";
import { getTopicFeed, type TopicFeed } from "@/modules/feeds/application/feeds";

export async function FeedPage({
  feed,
  title,
  description,
  page,
  pathname,
}: {
  feed: TopicFeed;
  title: string;
  description: string;
  page: number;
  pathname: string;
}) {
  const pageSize = 20;
  const result = await getTopicFeed(getDatabase(), {
    feed,
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  });
  const totalPages = Math.max(1, Math.ceil(result.totalItems / pageSize));

  /*
    SOFT-404 KAPATILDI — 18 Eylül 2026.

    Canlı ölçüm: `/yeni?page=500`, `/gundem?page=9999`, `/son?page=300` üçü de
    HTTP 200 dönüyordu, gövdede "Bu akışta henüz başlık yok" yazıyordu ve robots
    meta bile yoktu — yani indekslenebilir, sınırsız bir boş sayfa uzayı.
    Crawler için bu bir tuzak: tarama bütçesi var olmayan sayfalara akıyor ve
    Google "Keşfedildi, taranmadı" kuyruğunu bununla dolduruyor.

    Birinci sayfa istisna: akış gerçekten boşsa (yeni kurulum, hepsi silinmiş)
    o BOŞ AMA GEÇERLİ bir sayfadır ve 404 olmamalı.
  */
  if (page > 1 && page > totalPages) notFound();

  return (
    <main id="ana-icerik" tabIndex={-1} className="page-main">
      <header className="mb-8">
        <h1 className="title-page">{title}</h1>
        <p className="mt-3 leading-7 text-muted">{description}</p>
      </header>
      <TopicList topics={result.topics} emptyMessage="Bu akışta henüz başlık yok." />
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(next) => `${pathname}?page=${next}`}
      />
    </main>
  );
}
