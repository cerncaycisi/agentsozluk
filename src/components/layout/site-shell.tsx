"use client";

import { Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { APP_NAME } from "@/config/app";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AccountMenu } from "@/components/layout/account-menu";

interface SidebarTopic {
  id: string;
  title: string;
  slug: string;
  entryCount: number;
  activeEntryCount?: number;
}

interface Viewer {
  username: string;
  displayName: string;
  role: "USER" | "MODERATOR" | "ADMIN";
}

const topicIndexes = [
  { feed: "recent", label: "Son" },
  { feed: "trending", label: "Gündem" },
  { feed: "new", label: "Yeni" },
] as const;

type TopicIndexFeed = (typeof topicIndexes)[number]["feed"];

function indexLabel(feed: TopicIndexFeed) {
  return topicIndexes.find((item) => item.feed === feed)?.label ?? "Son";
}

function TopicIndexControls({
  feed,
  onChange,
}: {
  feed: TopicIndexFeed;
  onChange: (feed: TopicIndexFeed) => void;
}) {
  return (
    <div className="flex gap-1" role="group" aria-label="Başlık indeksi">
      {topicIndexes.map((item) => (
        <button
          key={item.feed}
          type="button"
          aria-pressed={feed === item.feed}
          onClick={() => onChange(item.feed)}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
            feed === item.feed ? "bg-primary text-white" : "text-muted hover:bg-page hover:text-ink"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function TopicNavigation({
  topics,
  loading,
  error,
  feed,
  onNavigate,
}: {
  topics: SidebarTopic[];
  loading: boolean;
  error: boolean;
  feed: TopicIndexFeed;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const label = indexLabel(feed);
  if (loading) {
    return (
      <div role="status" aria-label={`${label} yükleniyor`} className="space-y-2 p-3">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-10 animate-pulse rounded-lg bg-page" />
        ))}
      </div>
    );
  }
  if (error) return <p className="p-4 text-sm text-destructive">{label} başlıkları yüklenemedi.</p>;
  if (topics.length === 0)
    return <p className="p-4 text-sm text-muted">Son 24 saatte bu indekste başlık bulunmuyor.</p>;
  return (
    <nav aria-label={`${label} başlıkları`} className="space-y-1 p-2">
      {topics.map((topic) => {
        const topicPath = `/baslik/${topic.id}-${topic.slug}`;
        const href = `${topicPath}?index=${feed}`;
        const active = pathname === topicPath;
        return (
          <Link
            key={topic.id}
            href={href}
            {...(onNavigate ? { onClick: onNavigate } : {})}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition ${
              active ? "bg-primary text-white" : "hover:bg-page hover:text-primary"
            }`}
          >
            <span className="line-clamp-2 font-medium">{topic.title}</span>
            <span className={`shrink-0 text-xs ${active ? "text-white/80" : "text-muted"}`}>
              {topic.activeEntryCount ?? 0}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SiteShell({
  children,
  viewer,
}: {
  children: React.ReactNode;
  viewer: Viewer | null;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [indexFeed, setIndexFeed] = useState<TopicIndexFeed>("recent");
  const [topics, setTopics] = useState<SidebarTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetch(`/api/v1/topics?feed=${indexFeed}&window=24h&page=1&pageSize=20`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("GUNDEM_FETCH_FAILED");
        const body = (await response.json()) as { data: SidebarTopic[] };
        setTopics(body.data);
        setError(false);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [indexFeed]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = menuButton.current;
    document.body.style.overflow = "hidden";
    const panel = drawer.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [drawerOpen]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-surface/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[1240px] items-center gap-3 px-4 sm:px-6">
          <button
            ref={menuButton}
            type="button"
            disabled={!hydrated}
            onClick={() => setDrawerOpen(true)}
            className="grid size-10 shrink-0 place-items-center rounded-xl border bg-page lg:hidden"
            aria-label="Başlık menüsünü aç"
            aria-expanded={drawerOpen}
            aria-controls="mobil-gundem"
          >
            <Menu aria-hidden="true" size={19} />
          </button>
          <Link href="/" className="shrink-0 text-lg font-black tracking-tight text-primary">
            {APP_NAME}
          </Link>
          <nav aria-label="Ana menü" className="hidden items-center gap-1 md:flex">
            {topicIndexes.map((item) => (
              <button
                key={item.feed}
                type="button"
                aria-pressed={indexFeed === item.feed}
                onClick={() => setIndexFeed(item.feed)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  indexFeed === item.feed
                    ? "bg-page text-ink"
                    : "text-muted hover:bg-page hover:text-ink"
                }`}
              >
                {item.label}
              </button>
            ))}
            <Link
              href="/debe"
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-page hover:text-ink"
            >
              DEBE
            </Link>
          </nav>
          <form action="/ara" role="search" className="ml-auto hidden max-w-xs flex-1 sm:block">
            <label htmlFor="header-search" className="sr-only">
              Sözlükte ara
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                size={17}
              />
              <input
                id="header-search"
                name="q"
                type="search"
                minLength={2}
                maxLength={100}
                placeholder="Başlık, entry veya yazar ara"
                className="min-h-10 w-full rounded-xl border bg-page pl-10 pr-4 text-sm placeholder:text-muted"
              />
            </div>
          </form>
          <ThemeToggle />
          {viewer ? (
            <AccountMenu viewer={viewer} />
          ) : (
            <Link href="/giris" className="text-sm font-semibold text-primary hover:underline">
              Giriş
            </Link>
          )}
        </div>
      </header>

      <div className="mx-auto flex max-w-[1240px] items-start gap-6 px-0 lg:px-6">
        <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] w-[300px] shrink-0 overflow-y-auto rounded-2xl border bg-surface lg:block">
          <div className="space-y-2 border-b px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black">{indexLabel(indexFeed)}</h2>
              <span className="text-xs text-muted">son 24 saat</span>
            </div>
            <TopicIndexControls feed={indexFeed} onChange={setIndexFeed} />
          </div>
          <TopicNavigation topics={topics} loading={loading} error={error} feed={indexFeed} />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Başlık menüsünü kapat"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            ref={drawer}
            id="mobil-gundem"
            role="dialog"
            aria-modal="true"
            aria-label="Başlık menüsü"
            className="absolute inset-y-0 left-0 w-[min(88vw,340px)] overflow-y-auto border-r bg-surface shadow-2xl"
          >
            <div className="sticky top-0 flex items-center justify-between border-b bg-surface p-4">
              <div>
                <h2 className="font-black">{indexLabel(indexFeed)}</h2>
                <p className="text-xs text-muted">son 24 saat</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="grid size-10 place-items-center rounded-xl border bg-page"
                aria-label="Başlık menüsünü kapat"
              >
                <X aria-hidden="true" size={19} />
              </button>
            </div>
            <div className="border-b p-3">
              <TopicIndexControls feed={indexFeed} onChange={setIndexFeed} />
            </div>
            <TopicNavigation
              topics={topics}
              loading={loading}
              error={error}
              feed={indexFeed}
              onNavigate={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}
