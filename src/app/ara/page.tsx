import type { Metadata } from "next";
import Link from "next/link";
import { getDatabase } from "@/lib/db/client";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { searchAll } from "@/modules/search/application/search";
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
  const rawPage = Number(params.page ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const parsedType = searchTypeSchema.safeParse(params.type ?? "all");
  const type = parsedType.success ? parsedType.data : "all";
  const pageSize = 20;
  const result = await searchAll(getDatabase(), {
    query: params.q ?? "",
    type,
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  });
  const totalPages = Math.max(1, Math.ceil(result.totalItems / pageSize));
  return (
    <main id="ana-icerik" className="mx-auto max-w-[820px] px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">Sözlükte ara</h1>
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
            className="min-h-11 w-full rounded-xl border bg-page px-4"
          />
        </div>
        <button type="submit" className="button-primary self-end">
          Ara
        </button>
        <div className="flex flex-wrap gap-2 sm:col-span-2" aria-label="Arama türü">
          {Object.entries(labels).map(([value, label]) => (
            <label
              key={value}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <input type="radio" name="type" value={value} defaultChecked={type === value} />
              {label}
            </label>
          ))}
        </div>
      </form>

      <section aria-labelledby="arama-sonuclari" className="mt-8">
        <h2 id="arama-sonuclari" className="text-xl font-bold">
          {result.query.length < 2
            ? "Aramak için en az iki karakter yazın"
            : `${result.totalItems} sonuç`}
        </h2>
        <div className="mt-4 space-y-3">
          {result.results.map((item) => (
            <article key={`${item.type}-${item.id}`} className="surface-card p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-accent">
                {resultLabels[item.type]}
              </p>
              <h3 className="mt-1 text-lg font-bold">
                <Link href={item.url} className="hover:text-primary hover:underline">
                  {item.title}
                </Link>
              </h3>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-muted">{item.snippet}</p>
            </article>
          ))}
          {result.query.length >= 2 && result.results.length === 0 ? (
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
