import Link from "next/link";
import { canonicalTopicPath } from "@/modules/topics";
import type { TopicDirectoryPage } from "@/modules/topics/application/topics";

/*
  BAŞLIK DİZİNİ — 18 Eylül 2026.

  Bu sayfanın tek işi her başlığa taranabilir bir `<a href>` vermek. Ölçüm
  (Googlebot kimliğiyle canlı): keşif sayfalarının tamamında 63 tekil başlık
  linki vardı, sitemap'te 5.835 başlık.

  Sayfalama YOL tabanlı (`/basliklar/2`), sorgu tabanlı değil: `?page` taşıyan
  adresler noindex alıyor (`robotsForCanonicalView`) ve dizinin amacı tam tersi.

  BÜTÜN SAYFALAR TEK TEK BAĞLANIR, kısaltmalı pencere DEĞİL. Astra (18 Eylül)
  "her başlık en fazla üç tık" iddiamı çürüttü: standart sayfalama bileşeni
  30 sayfada yalnız 2, 3, 4 ve 30'u bağlıyor, en uzak başlık 15 tık uzakta
  kalıyordu. Dizinin bütün amacı kısa yol olduğu için burada tam liste var;
  30 bağlantı bir sayfaya rahat sığar ve derinlik gerçekten 3 tıka iner.
*/
export function TopicDirectory({ page, data }: { page: number; data: TopicDirectoryPage }) {
  const { topics, totalItems, totalPages } = data;
  const hrefFor = (target: number) => (target === 1 ? "/basliklar" : `/basliklar/${target}`);

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

      {totalPages > 1 ? (
        <nav aria-label="Dizin sayfaları" className="mt-8 border-t pt-6">
          <ul className="flex flex-wrap gap-2">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((target) => (
              <li key={target}>
                {target === page ? (
                  <span
                    aria-current="page"
                    className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg border border-primary bg-primary px-2 text-sm font-semibold text-on-primary"
                  >
                    {target}
                  </span>
                ) : (
                  <Link
                    href={hrefFor(target)}
                    className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg border bg-surface px-2 text-sm font-semibold text-ink transition hover:border-primary hover:text-primary"
                  >
                    {target}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
