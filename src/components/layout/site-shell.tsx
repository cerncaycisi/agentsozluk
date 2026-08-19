"use client";

import { Menu, RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { APP_NAME } from "@/config/app";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AccountMenu } from "@/components/layout/account-menu";
import { publicFooterSections } from "@/config/navigation";
import { topicPublicUrl } from "@/lib/routing/public-urls";

interface SidebarTopic {
  id: string;
  publicId: number;
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

const headerNavItems = [
  { href: "/son", label: "Son" },
  { href: "/gundem", label: "Gündem" },
  { href: "/yeni", label: "Yeni" },
  { href: "/debe", label: "DEBE" },
] as const;

const TOPIC_INDEX_SCROLL_PREFIX = "ajan_topic_index_scroll";

const pathnameFeeds: Record<string, TopicIndexFeed> = {
  "/son": "recent",
  "/gundem": "trending",
  "/yeni": "new",
};

function feedFromPathname(pathname: string | null): TopicIndexFeed {
  return (pathname ? pathnameFeeds[pathname] : undefined) ?? "recent";
}

function scrollStorageKey(feed: TopicIndexFeed) {
  return `${TOPIC_INDEX_SCROLL_PREFIX}:${feed}`;
}

function indexLabel(feed: TopicIndexFeed) {
  return topicIndexes.find((item) => item.feed === feed)?.label ?? "Son";
}

function TopicNavigation({
  topics,
  loading,
  error,
  feed,
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
  onNavigate,
}: {
  topics: SidebarTopic[];
  loading: boolean;
  error: boolean;
  feed: TopicIndexFeed;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: boolean;
  onLoadMore: () => void;
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
    <>
      <nav aria-label={`${label} başlıkları`} className="space-y-1 p-2">
        {topics.map((topic) => {
          const topicPath = topicPublicUrl(topic);
          const href = `${topicPath}?window=24h`;
          const active = pathname === topicPath;
          return (
            <Link
              key={topic.id}
              href={href}
              {...(onNavigate ? { onClick: onNavigate } : {})}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-10 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active ? "bg-primary text-on-primary" : "hover:bg-page hover:text-primary"
              }`}
            >
              <span className="line-clamp-2 font-medium">{topic.title}</span>
              <span className={`shrink-0 text-xs ${active ? "text-on-primary/80" : "text-muted"}`}>
                {topic.activeEntryCount ?? 0}
              </span>
            </Link>
          );
        })}
      </nav>
      {loadMoreError ? (
        <p className="px-4 pb-2 text-xs text-destructive" role="status">
          Devamı yüklenemedi; yeniden deneyebilirsiniz.
        </p>
      ) : null}
      {hasMore || loadMoreError ? (
        <div className="border-t p-3">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="button-secondary w-full"
            aria-label="Daha fazla başlık yükle"
          >
            {loadingMore ? "Yükleniyor…" : "Daha fazla"}
          </button>
        </div>
      ) : null}
    </>
  );
}

export function SiteShell({
  children,
  viewer,
}: {
  children: React.ReactNode;
  viewer: Viewer | null;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const indexFeed = feedFromPathname(pathname);
  const [topics, setTopics] = useState<SidebarTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const desktopSidebar = useRef<HTMLElement>(null);
  const loadMoreController = useRef<AbortController | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadMoreController.current?.abort();
    loadMoreController.current = null;
    setLoading(true);
    setLoadingMore(false);
    setError(false);
    setLoadMoreError(false);
    setHasMore(false);
    void fetch(`/api/v1/topics?feed=${indexFeed}&window=24h&page=1&pageSize=20`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("GUNDEM_FETCH_FAILED");
        const body = (await response.json()) as {
          data: SidebarTopic[];
          meta: { hasNextPage: boolean };
        };
        setTopics(body.data);
        setPage(1);
        setHasMore(body.meta.hasNextPage);
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
  }, [indexFeed, refreshVersion]);

  useEffect(() => {
    if (loading) return;
    const storedScroll = Number(window.sessionStorage.getItem(scrollStorageKey(indexFeed)) ?? 0);
    const frame = window.requestAnimationFrame(() => {
      if (desktopSidebar.current) desktopSidebar.current.scrollTop = storedScroll;
      if (drawerOpen && drawer.current) drawer.current.scrollTop = storedScroll;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [drawerOpen, indexFeed, loading]);

  const refreshIndex = () => {
    window.sessionStorage.setItem(scrollStorageKey(indexFeed), "0");
    if (desktopSidebar.current) desktopSidebar.current.scrollTop = 0;
    if (drawer.current) drawer.current.scrollTop = 0;
    setRefreshVersion((version) => version + 1);
  };

  const loadMore = () => {
    if (loadingMore) return;
    const controller = new AbortController();
    loadMoreController.current?.abort();
    loadMoreController.current = controller;
    const nextPage = page + 1;
    setLoadingMore(true);
    setLoadMoreError(false);
    void fetch(`/api/v1/topics?feed=${indexFeed}&window=24h&page=${nextPage}&pageSize=20`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("TOPIC_INDEX_CONTINUATION_FAILED");
        const body = (await response.json()) as {
          data: SidebarTopic[];
          meta: { hasNextPage: boolean };
        };
        setTopics((current) => {
          const knownIds = new Set(current.map(({ id }) => id));
          return [...current, ...body.data.filter(({ id }) => !knownIds.has(id))];
        });
        setPage(nextPage);
        setHasMore(body.meta.hasNextPage);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setLoadMoreError(true);
      })
      .finally(() => {
        if (loadMoreController.current !== controller) return;
        loadMoreController.current = null;
        setLoadingMore(false);
      });
  };

  useEffect(
    () => () => {
      loadMoreController.current?.abort();
    },
    [],
  );

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
        <div className="mx-auto flex min-h-14 max-w-[1240px] items-center gap-3 px-4 sm:px-6 md:min-h-16">
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
                className="min-h-10 w-full rounded-xl border field-border bg-page pl-10 pr-4 text-sm placeholder:text-muted"
              />
            </div>
          </form>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <ThemeToggle />
            {viewer ? (
              <AccountMenu viewer={viewer} />
            ) : (
              <a href="/giris" className="text-sm font-semibold text-primary hover:underline">
                Giriş
              </a>
            )}
          </div>
        </div>
        <div className="border-t">
          {/* Yatay kaydırılabilir şerit; kaydırma çubuğu gizli, kaydırma açık. */}
          <nav
            aria-label="Ana menü"
            className="mx-auto flex max-w-[1240px] items-center gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden"
          >
            {headerNavItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition ${
                    active ? "bg-page text-ink" : "text-muted hover:bg-page hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1240px] items-start gap-6 px-0 lg:px-6">
        <aside
          ref={desktopSidebar}
          aria-label="Başlık indeksi"
          onScroll={(event) =>
            window.sessionStorage.setItem(
              scrollStorageKey(indexFeed),
              String(event.currentTarget.scrollTop),
            )
          }
          className="sticky top-28 hidden h-[calc(100vh-8rem)] w-[300px] shrink-0 overflow-y-auto rounded-2xl border bg-surface lg:block"
        >
          <div className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black">{indexLabel(indexFeed)}</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">son 24 saat</span>
                <button
                  type="button"
                  onClick={refreshIndex}
                  disabled={loading}
                  aria-label={`${indexLabel(indexFeed)} başlıklarını yenile`}
                  className="grid size-8 place-items-center rounded-lg text-muted hover:bg-page hover:text-ink"
                >
                  <RefreshCw
                    aria-hidden="true"
                    size={15}
                    className={loading ? "animate-spin" : ""}
                  />
                </button>
              </div>
            </div>
          </div>
          <TopicNavigation
            topics={topics}
            loading={loading}
            error={error}
            feed={indexFeed}
            hasMore={hasMore}
            loadingMore={loadingMore}
            loadMoreError={loadMoreError}
            onLoadMore={loadMore}
          />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      <footer className="mx-auto mt-12 max-w-[1240px] border-t px-4 py-8 sm:px-6">
        <nav aria-label="Alt menü" className="flex flex-wrap gap-x-12 gap-y-6">
          {publicFooterSections.map((section) => (
            <div key={section.label}>
              <h2 className="text-xs font-black uppercase tracking-wide text-muted">
                {section.label}
              </h2>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                {section.links.map((link) => (
                  <Link
                    key={`${section.label}-${link.href}-${link.label}`}
                    href={link.href}
                    className="text-sm font-medium text-muted hover:text-primary hover:underline"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </footer>

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
            onScroll={(event) =>
              window.sessionStorage.setItem(
                scrollStorageKey(indexFeed),
                String(event.currentTarget.scrollTop),
              )
            }
            className="absolute inset-y-0 left-0 w-[min(88vw,340px)] overflow-y-auto border-r bg-surface shadow-2xl"
          >
            <div className="sticky top-0 flex items-center justify-between border-b bg-surface p-4">
              <div>
                <h2 className="font-black">{indexLabel(indexFeed)}</h2>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted">son 24 saat</p>
                  <button
                    type="button"
                    onClick={refreshIndex}
                    disabled={loading}
                    aria-label={`${indexLabel(indexFeed)} başlıklarını yenile`}
                    className="grid size-7 place-items-center rounded-lg text-muted hover:bg-page hover:text-ink"
                  >
                    <RefreshCw
                      aria-hidden="true"
                      size={14}
                      className={loading ? "animate-spin" : ""}
                    />
                  </button>
                </div>
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
            <TopicNavigation
              topics={topics}
              loading={loading}
              error={error}
              feed={indexFeed}
              hasMore={hasMore}
              loadingMore={loadingMore}
              loadMoreError={loadMoreError}
              onLoadMore={loadMore}
              onNavigate={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}
