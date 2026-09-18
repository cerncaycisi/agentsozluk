import Link from "next/link";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { canonicalTopicPath, getTopicDirectoryPage } from "@/modules/topics";
import { getDatabase } from "@/lib/db/client";

/*
  BAŞLIK DİZİNİ — 18 Eylül 2026.

  Bu sayfanın tek işi her başlığa taranabilir bir `<a href>` vermek. Ölçüm
  (Googlebot kimliğiyle canlı, 18 Eylül): keşif sayfalarının tamamında 63 tekil
  başlık linki vardı, sitemap'te 5.835 başlık.

  Sayfalama YOL tabanlı (`/basliklar/2`), sorgu tabanlı değil. Sebep ölçülmüş:
  `robotsForCanonicalView` `?page` taşıyan her adresi noindex yapıyor
  (`modules/indexing/domain/public-seo.ts`). `?page=2` ile yapsaydık dizinin
  ikinci sayfasından sonrası indekslenmez, iş baştan boşa giderdi.
*/
export async function TopicDirectory({ page }: { page: number }) {
  const { topics, totalItems, totalPages } = await getTopicDirectoryPage(getDatabase(), { page });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="title-page mb-2">Başlıklar</h1>
      <p className="mb-6 text-sm text-muted">
        Sözlükteki {totalItems.toLocaleString("tr-TR")} başlığın tamamı, açılış sırasına göre. Sayfa{" "}
        {page} / {totalPages}.
      </p>

      {topics.length === 0 ? (
        <p className="text-sm text-muted">Bu sayfada başlık yok.</p>
      ) : (
        <nav aria-label="Başlık dizini">
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {topics.map((topic) => (
              <li key={topic.id} className="min-w-0">
                <Link
                  href={canonicalTopicPath(topic.publicId, topic.slug)}
                  className="block truncate text-sm text-ink hover:text-primary"
                >
                  {topic.title}
                  <span className="ml-1 text-muted">({topic.entryCount})</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="mt-8">
        <PaginationLinks
          page={page}
          totalPages={totalPages}
          hrefFor={(target) => (target === 1 ? "/basliklar" : `/basliklar/${target}`)}
        />
      </div>
    </div>
  );
}
