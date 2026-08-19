import Link from "next/link";

type PageItem = { kind: "page"; value: number } | { kind: "gap"; key: string };

const targetClass =
  "inline-flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-lg border bg-surface text-sm font-semibold text-ink transition hover:border-primary hover:text-primary sm:min-h-9 sm:min-w-9";

const currentClass =
  "inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg border border-primary bg-primary px-1.5 text-sm font-semibold text-on-primary sm:min-h-9 sm:min-w-9 sm:px-2";

const numberClass = `${targetClass} px-1.5 sm:px-2`;

const wideClass = `${targetClass} px-1.5 sm:px-3`;

/**
 * Görünür sayfa numaralarını üretir.
 * - `totalPages <= 7`: bütün sayfalar (1 2 3 4 5 6 7)
 * - `totalPages > 7`: kısaltmalı pencere (1 … 4 5 6 … 104)
 */
function buildPageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => ({
      kind: "page" as const,
      value: index + 1,
    }));
  }

  let start = Math.max(2, page - 1);
  let end = Math.min(totalPages - 1, page + 1);
  if (page <= 3) {
    start = 2;
    end = Math.min(totalPages - 1, 4);
  } else if (page >= totalPages - 2) {
    start = Math.max(2, totalPages - 3);
    end = totalPages - 1;
  }

  const items: PageItem[] = [{ kind: "page", value: 1 }];
  if (start > 2) items.push({ kind: "gap", key: "gap-start" });
  for (let value = start; value <= end; value += 1) {
    items.push({ kind: "page", value });
  }
  if (end < totalPages - 1) items.push({ kind: "gap", key: "gap-end" });
  items.push({ kind: "page", value: totalPages });
  return items;
}

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
  const items = buildPageItems(page, totalPages);
  const showEdgeLinks = totalPages > 2;

  return (
    <nav aria-label="Sayfalama" className="mt-8 flex flex-col items-center gap-2">
      <ol className="flex w-full flex-nowrap items-center justify-center gap-1 overflow-x-auto py-1 sm:gap-2">
        {page > 1 ? (
          <li>
            <Link
              href={hrefFor(page - 1)}
              rel="prev"
              aria-label="Önceki sayfa"
              className={wideClass}
            >
              <span aria-hidden="true">‹</span>
              <span className="hidden sm:inline">Önceki sayfa</span>
            </Link>
          </li>
        ) : null}

        {showEdgeLinks && page > 1 ? (
          <li className="hidden sm:block">
            <Link href={hrefFor(1)} aria-label="İlk sayfa" className={wideClass}>
              İlk
            </Link>
          </li>
        ) : null}

        {items.map((item) =>
          item.kind === "gap" ? (
            <li
              key={item.key}
              aria-hidden="true"
              className="inline-flex min-w-4 justify-center text-sm text-muted"
            >
              …
            </li>
          ) : (
            <li key={item.value}>
              {item.value === page ? (
                <span aria-current="page" className={currentClass}>
                  {item.value}
                </span>
              ) : (
                <Link
                  href={hrefFor(item.value)}
                  aria-label={`Sayfa ${item.value}`}
                  className={numberClass}
                >
                  {item.value}
                </Link>
              )}
            </li>
          ),
        )}

        {showEdgeLinks && page < totalPages ? (
          <li className="hidden sm:block">
            <Link href={hrefFor(totalPages)} aria-label="Son sayfa" className={wideClass}>
              Son
            </Link>
          </li>
        ) : null}

        {page < totalPages ? (
          <li>
            <Link
              href={hrefFor(page + 1)}
              rel="next"
              aria-label="Sonraki sayfa"
              className={wideClass}
            >
              <span className="hidden sm:inline">Sonraki sayfa</span>
              <span aria-hidden="true">›</span>
            </Link>
          </li>
        ) : null}
      </ol>
      <p className="text-sm text-muted">
        Sayfa {page} / {totalPages}
      </p>
    </nav>
  );
}
