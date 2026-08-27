"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/http/client";
import { preferredTopicCreationSearchQuery } from "@/modules/topics/domain/canonicalization";

interface TopicSearchResult {
  type: "topic" | "entry" | "user";
  id: string;
  title: string;
  snippet: string;
  url: string;
  rank: number;
}

/**
 * İki bağlam, iki metin. `composer` yazmak üzere olan birine "önce şunlara bak"
 * diyor ve bağlantıyı yeni sekmede açıyor — taslak kaybolmasın. `discovery`
 * ise hiç yazmayacak olana, örneğin girişsiz ziyaretçiye, açılmamış başlık
 * sayfasında yakın başlıkları gösteriyor; orada yeni sekme gereksiz, gezinme
 * aynı sekmede sürmeli. Benchmark'ta da liste composer'ın altında duruyor
 * (BENCHMARK_GIRISLI §5, "benzer başlıklar").
 */
export function TopicCanonicalSuggestions({
  title,
  variant = "composer",
}: {
  title: string;
  variant?: "composer" | "discovery";
}) {
  const [results, setResults] = useState<TopicSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const query = preferredTopicCreationSearchQuery(title);

  useEffect(() => {
    let current = true;
    if ([...query].length < 2) {
      setResults([]);
      setLoading(false);
      return () => {
        current = false;
      };
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      void apiRequest<TopicSearchResult[]>(
        `/api/v1/search?type=topics&q=${encodeURIComponent(query)}`,
      )
        .then((items) => {
          if (current) setResults(items.filter((item) => item.type === "topic").slice(0, 5));
        })
        .catch(() => {
          if (current) setResults([]);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 400);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  if ([...query].length < 2) return null;
  return (
    <section
      aria-labelledby="canonical-topic-suggestions-title"
      className="rounded-lg border bg-page p-4 text-sm"
    >
      <h2 id="canonical-topic-suggestions-title" className="font-semibold">
        {variant === "discovery"
          ? `“${query}” ile benzer başlıklar`
          : "Önce mevcut ve alternatif adları kontrol edin"}
      </h2>
      <div aria-live="polite" className="mt-2">
        {loading ? <p className="text-muted">“{query}” aranıyor…</p> : null}
        {!loading && results.length === 0 ? (
          <p className="text-muted">“{query}” için mevcut başlık bulunamadı.</p>
        ) : null}
        {!loading && results.length > 0 ? (
          <ul className="space-y-2">
            {results.map((result) => (
              <li key={result.id}>
                <Link
                  href={result.url}
                  {...(variant === "composer"
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className="link-strong font-semibold"
                >
                  {result.title}
                </Link>
                {result.snippet !== result.title ? (
                  <span className="text-muted"> · eşleşen ad: {result.snippet}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
