import Link from "next/link";

export function PaginationLinks({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Sayfalama" className="mt-8 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="button-secondary">
          Önceki sayfa
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted">
        Sayfa {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className="button-secondary">
          Sonraki sayfa
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
