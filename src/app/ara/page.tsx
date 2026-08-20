import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { currentPageSession } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { pageFrom } from "@/lib/http/pagination";
import { PaginationLinks } from "@/components/ui/pagination-links";
import {
  enforceRateLimit,
  ipRateLimitIdentifier,
  RATE_LIMIT_RULES,
  requestIp,
  userRateLimitIdentifier,
} from "@/modules/rate-limit/application/rate-limit";
import { searchAll } from "@/modules/search/application/search";
import { normalizeSearchQuery } from "@/modules/search/domain/normalization";
import { searchTypeSchema, type SearchType } from "@/modules/search/validation/schemas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ara" };

const labels: Record<SearchType, string> = {
  all: "Tümü",
  topics: "Başlıklar",
  entries: "Entry’ler",
  users: "Yazarlar",
};

const resultLabels = {
  topic: "Başlık",
  entry: "Entry",
  user: "Yazar",
} as const;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = pageFrom(params.page);
  const parsedType = searchTypeSchema.safeParse(params.type ?? "all");
  const type = parsedType.success ? parsedType.data : "all";
  const pageSize = 20;
  const database = getDatabase();
  const query = normalizeSearchQuery(params.q ?? "").slice(0, 100);
  let rateLimited = false;
  let result: Awaited<ReturnType<typeof searchAll>>;
  try {
    if (query.length >= 2) {
      const [session, requestHeaders] = await Promise.all([currentPageSession(), headers()]);
      await enforceRateLimit(
        database,
        session
          ? userRateLimitIdentifier(session.userId)
          : ipRateLimitIdentifier(requestIp({ headers: requestHeaders })),
        session ? RATE_LIMIT_RULES.searchAuthenticated : RATE_LIMIT_RULES.searchVisitor,
      );
    }
    result = await searchAll(database, {
      query,
      type,
      page,
      pageSize,
      skip: (page - 1) * pageSize,
    });
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "RATE_LIMITED") throw error;
    rateLimited = true;
    result = { query, results: [], totalItems: 0 };
  }
  const totalPages = Math.max(1, Math.ceil(result.totalItems / pageSize));
  return (
    <main id="ana-icerik" className="page-main">
      <h1 className="title-page">Sözlükte ara</h1>
      <form
        action="/ara"
        role="search"
        className="surface-card mt-6 grid gap-4 p-5 sm:grid-cols-[1fr_auto]"
      >
        <div>
          <label htmlFor="search-query" className="mb-2 block text-sm font-semibold">
            Arama metni
          </label>
          <input
            id="search-query"
            name="q"
            type="search"
            defaultValue={result.query}
            minLength={2}
            maxLength={100}
            className="min-h-11 w-full rounded border field-border bg-page px-4"
          />
        </div>
        <button type="submit" className="button-primary self-end">
          Ara
        </button>
        <div className="flex flex-wrap gap-2 sm:col-span-2" aria-label="Arama türü">
          {Object.entries(labels).map(([value, label]) => (
            <label key={value} className="chip gap-2">
              <input
                type="radio"
                name="type"
                value={value}
                defaultChecked={type === value}
                className="size-6 shrink-0 accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </form>

      <section aria-labelledby="arama-sonuclari" className="mt-8">
        <h2 id="arama-sonuclari" className="title-section">
          {rateLimited
            ? "Arama sınırına ulaştınız; lütfen kısa süre sonra yeniden deneyin"
            : result.query.length < 2
              ? "Aramak için en az iki karakter yazın"
              : `${result.totalItems} sonuç`}
        </h2>
        <div className="mt-4 space-y-3">
          {result.results.map((item) => (
            <article key={`${item.type}-${item.id}`} className="surface-card p-5">
              <p className="eyebrow">{resultLabels[item.type]}</p>
              <h3 className="title-item mt-1">
                <Link
                  href={item.url}
                  className="inline-flex min-h-6 items-center hover:text-primary hover:underline"
                >
                  {item.title}
                </Link>
              </h3>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-muted">{item.snippet}</p>
            </article>
          ))}
          {!rateLimited && result.query.length >= 2 && result.results.length === 0 ? (
            <p className="surface-card p-6 text-muted">Aramanızla eşleşen sonuç bulunamadı.</p>
          ) : null}
        </div>
      </section>
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(next) => `/ara?q=${encodeURIComponent(result.query)}&type=${type}&page=${next}`}
      />
    </main>
  );
}
