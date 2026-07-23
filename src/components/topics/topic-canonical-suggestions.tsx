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

export function TopicCanonicalSuggestions({ title }: { title: string }) {
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
      className="rounded-xl border bg-page p-4 text-sm"
    >
      <h2 id="canonical-topic-suggestions-title" className="font-bold">
        Önce mevcut ve alternatif adları kontrol edin
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
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-primary hover:underline"
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
