"use client";

import { Menu, RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { APP_NAME } from "@/config/app";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AccountMenu } from "@/components/layout/account-menu";
import { SearchAutocomplete } from "@/components/search/search-autocomplete";
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

/**
 * WCAG 2.2 SC 2.5.8 wants a 24×24 CSS px target; mobile gets a roomier 44px row
 * and collapses back to the 24px floor from the `sm` breakpoint up.
 */
const footerLinkClass =
  "inline-flex min-h-11 items-center text-sm font-medium text-muted hover:text-primary hover:underline sm:min-h-6";

/**
 * Evaluated during render, so the server-rendered HTML carries the year the
 * server computed; hydration re-reads the same clock moments later. The
 * `suppressHydrationWarning` on the copyright node covers the New Year edge.
 */
function currentYear(): number {
  return new Date().getFullYear();
}

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
              /*
                Aktiflik dolguyla değil solda 3px'lik kiremit çizgiyle söyleniyor. Dolgu,
                "şu an buradasın" bilgisine birincil buton ağırlığı veriyordu; filtre
                şeritleri dolgudan çıkınca sayfada tek dolgulu birincil yüzey burası
                kalmıştı. Çizgi bir gölge DEĞİL, `before` ile çizilen bir kenar: hem
                "gölge yok" kuralı bozulmuyor hem satır 3px kaymıyor.
              */
              className={`relative flex min-h-10 items-center justify-between gap-3 px-3 py-2 text-sm transition ${
                active
                  ? "rounded-r text-primary before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary before:content-['']"
                  : "rounded hover:bg-page hover:text-primary"
              }`}
            >
              <span className="line-clamp-2 font-medium">{topic.title}</span>
              <span className={`shrink-0 text-xs ${active ? "text-primary/70" : "text-muted"}`}>
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
  const [searchOpen, setSearchOpen] = useState(false);
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
  const searchButton = useRef<HTMLButtonElement>(null);
  const searchPanel = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const restoreSearchFocus = useRef(false);
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

  // Panel modal değil: sayfa kaydırması kilitlenmez, focus hapsedilmez.
  // Esc veya tetikleyiciye tekrar basınca focus büyüteç butonuna döner;
  // dışarı tıklamada dönmez, çünkü focus zaten tıklanan öğeye gitmiştir.
  const closeSearch = (restoreFocus: boolean) => {
    restoreSearchFocus.current = restoreFocus;
    setSearchOpen(false);
  };

  useEffect(() => {
    if (!searchOpen) return;
    const trigger = searchButton.current;
    searchInput.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSearch(true);
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (searchPanel.current?.contains(target) || trigger?.contains(target)) return;
      closeSearch(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      if (!restoreSearchFocus.current) return;
      restoreSearchFocus.current = false;
      trigger?.focus();
    };
  }, [searchOpen]);

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
        <div className="mx-auto flex min-h-14 max-w-[1240px] items-center gap-2 px-4 sm:gap-3 sm:px-6 md:min-h-16">
          <button
            ref={menuButton}
            type="button"
            disabled={!hydrated}
            onClick={() => setDrawerOpen(true)}
            className="grid size-11 shrink-0 place-items-center rounded-xl border bg-page lg:hidden"
            aria-label="Başlık menüsünü aç"
            aria-expanded={drawerOpen}
            aria-controls="mobil-gundem"
          >
            <Menu aria-hidden="true" size={19} />
          </button>
          {/* Dar ekranda logo son çare olarak kısalır: satır 1'de "Kayıt ol"
              varken 320px'te taşmaya değil, kırpmaya izin veriyoruz. */}
          <Link
            href="/"
            className="min-w-0 truncate text-base font-semibold tracking-tight text-primary sm:text-lg"
          >
            {APP_NAME}
          </Link>
          {/* Arama formu tek yerde tanımlı: satır 1'deki satır içi form ve
              `<640px` açılır paneli aynı bileşeni kullanır (görev 27 combobox'ı). */}
          <SearchAutocomplete
            inputId="header-search"
            className="ml-auto hidden max-w-xs flex-1 sm:block"
          />
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              ref={searchButton}
              type="button"
              onClick={() => (searchOpen ? closeSearch(true) : setSearchOpen(true))}
              className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl border bg-page sm:hidden"
              aria-label="Aramayı aç"
              aria-expanded={searchOpen}
              aria-controls="mobil-arama"
            >
              <Search aria-hidden="true" size={19} />
            </button>
            <ThemeToggle />
            {viewer ? (
              <AccountMenu viewer={viewer} />
            ) : (
              // Misafirin birincil eylemi kayıt: oturum açmış kullanıcının hesap
              // menüsüyle aynı yerde duruyor. 375px'te satır 1'de iki CTA'ya yer
              // yok (ölçüldü: 398px içerik / 375px alan), bu yüzden "Giriş"
              // ikinci satırın sağ ucunda.
              <a
                href="/kayit"
                className="button-primary shrink-0 whitespace-nowrap px-3 text-sm sm:px-4"
              >
                Kayıt ol
              </a>
            )}
          </div>
        </div>
        <div className="border-t">
          <div className="mx-auto flex max-w-[1240px] items-center gap-2 px-4 sm:px-6">
            {/* Yatay kaydırılabilir şerit; kaydırma çubuğu gizli, kaydırma açık. */}
            <nav
              aria-label="Ana menü"
              className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {headerNavItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition ${
                      active ? "bg-page text-primary" : "text-muted hover:bg-page hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            {viewer ? null : (
              // İkincil CTA: satır 1'de yer kalmadığı için şeridin sağ ucunda,
              // kaydırma kabının dışında — her genişlikte görünür kalıyor.
              <a href="/giris" className="button-secondary shrink-0 whitespace-nowrap px-3 text-sm">
                Giriş
              </a>
            )}
          </div>
        </div>
        {searchOpen ? (
          // Modal değil, açılır bir satır: kapalıyken DOM'da yok, header yüksekliği değişmez.
          <div ref={searchPanel} id="mobil-arama" className="border-t sm:hidden">
            <div className="mx-auto max-w-[1240px] px-4 py-2 sm:px-6">
              <SearchAutocomplete
                inputId="mobil-arama-input"
                inputRef={searchInput}
                className="w-full"
              />
            </div>
          </div>
        ) : null}
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
              <h2 className="text-sm font-semibold">{indexLabel(indexFeed)}</h2>
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
              <h2 className="eyebrow text-muted">{section.label}</h2>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                {section.links.map((link) =>
                  link.external ? (
                    <a
                      key={`${section.label}-${link.href}-${link.label}`}
                      href={link.href}
                      className={footerLinkClass}
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      key={`${section.label}-${link.href}-${link.label}`}
                      href={link.href}
                      className={footerLinkClass}
                    >
                      {link.label}
                    </Link>
                  ),
                )}
              </div>
            </div>
          ))}
        </nav>
        <p className="mt-8 border-t pt-6 text-sm text-muted">
          <span className="font-semibold text-primary">{APP_NAME}</span>
          <span aria-hidden="true"> · </span>
          <span suppressHydrationWarning>{`© ${currentYear()} ${APP_NAME}`}</span>
        </p>
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
                <h2 className="font-semibold">{indexLabel(indexFeed)}</h2>
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
