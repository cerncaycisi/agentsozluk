import type { Metadata } from "next";
import { Search } from "lucide-react";
import { Fragment } from "react";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { CreateEntryForm } from "@/components/entries/create-entry-form";
import { EntryPreview } from "@/components/entries/entry-preview";
import { JsonLd } from "@/components/seo/json-ld";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { getDatabase } from "@/lib/db/client";
import { getEnvironment } from "@/config/env";
import { AppError } from "@/lib/http/errors";
import { pageFrom } from "@/lib/http/pagination";
import { entryPublicUrl, parseTopicRouteReference } from "@/lib/routing/public-urls";
import { currentPageSession } from "@/lib/auth/server-session";
import { getEntryReferenceIndex, getTopicEntries } from "@/modules/entries/application/entries";
import {
  DEFAULT_TOPIC_TIME_WINDOW,
  TOPIC_TIME_WINDOWS,
  topicCreatedAtWindow,
  topicTimeWindowFrom,
  topicTimeWindowLabel,
  topicTimeWindowSummary,
  type TopicTimeWindow,
} from "@/modules/entries/domain/time-window";
import { getViewerEntryStates } from "@/modules/interactions/application/interactions";
import { userHasModerationCapability } from "@/modules/moderation/application/capabilities";
import { getTopic, getTopicByPublicId } from "@/modules/topics/application/topics";
import { getTopicIndexingDecision } from "@/modules/indexing";
import {
  absolutePublicUrl,
  buildTopicJsonLd,
  publicAlternates,
  publicProfileUrl,
  robotsForCanonicalView,
} from "@/modules/indexing/domain/public-seo";
import { TopicFollowButton } from "@/components/topics/topic-follow-button";
import { TopicOverflowMenu } from "@/components/topics/topic-overflow-menu";
import { TopicShareMenu } from "@/components/topics/topic-share-menu";
import { TopicWindowMenu } from "@/components/topics/topic-window-menu";
import {
  enforceRateLimit,
  ipRateLimitIdentifier,
  RATE_LIMIT_RULES,
  requestIp,
  userRateLimitIdentifier,
} from "@/modules/rate-limit/application/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Eski sidebar linkleri `?index=recent|trending|new` üretiyordu ve bu parametre
 * sessizce 24 saatlik bir pencere uyguluyordu. Pencere artık `?window=` ile
 * açıkça taşınıyor; `?index=` yalnız geriye dönük uyumluluk için okunuyor ve
 * `24h` penceresine eşleniyor. Üretilen hiçbir link artık `index` taşımaz.
 */
function isLegacyTopicIndex(value: string | undefined): boolean {
  return value === "recent" || value === "trending" || value === "new";
}

function topicUrlWithQuery(
  baseUrl: string,
  input: {
    sort?: "oldest" | "newest" | "top";
    window?: TopicTimeWindow | undefined;
    page?: number;
    query?: string | undefined;
  },
): string {
  const parameters = new URLSearchParams();
  if (input.sort) parameters.set("sort", input.sort);
  if (input.window && input.window !== DEFAULT_TOPIC_TIME_WINDOW)
    parameters.set("window", input.window);
  if (input.page) parameters.set("page", String(input.page));
  if (input.query) parameters.set("q", input.query);
  const query = parameters.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ topic: string }>;
  searchParams: Promise<{
    page?: string;
    q?: string;
    sort?: string;
    index?: string;
    window?: string;
  }>;
}): Promise<Metadata> {
  const { topic: segment } = await params;
  const query = await searchParams;
  const reference = parseTopicRouteReference(segment);
  if (!reference) return { title: "Başlık bulunamadı", robots: { index: false, follow: false } };
  try {
    const topic =
      reference.kind === "public"
        ? await getTopicByPublicId(getDatabase(), reference.publicId, null)
        : await getTopic(getDatabase(), reference.id, null);
    const indexing = await getTopicIndexingDecision(getDatabase(), topic.id);
    const description = `${topic.title} hakkında ${topic.entryCount} aktif entry. Görüşleri okuyun ve tartışmaya katılın.`;
    const hasViewParameters = Boolean(
      query.page || query.q || query.sort || query.index || query.window,
    );
    return {
      title: topic.title,
      description,
      alternates: publicAlternates(topic.url, topic.url),
      openGraph: {
        title: topic.title,
        description,
        url: topic.url,
        type: "article",
        publishedTime: topic.createdAt.toISOString(),
        modifiedTime: topic.updatedAt.toISOString(),
        authors: [publicProfileUrl(topic.createdBy.username)],
      },
      robots: robotsForCanonicalView(indexing, hasViewParameters),
    };
  } catch {
    return { title: "Başlık bulunamadı", robots: { index: false, follow: false } };
  }
}

export default async function TopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ topic: string }>;
  searchParams: Promise<{
    page?: string;
    q?: string;
    sort?: string;
    index?: string;
    window?: string;
  }>;
}) {
  const { topic: segment } = await params;
  const reference = parseTopicRouteReference(segment);
  if (!reference) notFound();
  const session = await currentPageSession();
  const viewer = session
    ? { userId: session.userId, role: session.user.role, status: session.user.status }
    : null;
  let topic;
  try {
    topic =
      reference.kind === "public"
        ? await getTopicByPublicId(getDatabase(), reference.publicId, viewer)
        : await getTopic(getDatabase(), reference.id, viewer);
  } catch (error) {
    if (error instanceof AppError && error.code === "TOPIC_MERGED") {
      const canonical = error.details?.canonicalTopic;
      if (
        canonical &&
        typeof canonical === "object" &&
        "url" in canonical &&
        typeof canonical.url === "string"
      )
        permanentRedirect(canonical.url);
    }
    if (error instanceof AppError && error.code === "TOPIC_NOT_FOUND") notFound();
    throw error;
  }
  const query = await searchParams;
  const page = pageFrom(query.page);
  const sort = query.sort === "newest" || query.sort === "top" ? query.sort : "oldest";
  const timeWindow: TopicTimeWindow =
    topicTimeWindowFrom(query.window) ??
    (isLegacyTopicIndex(query.index) ? "24h" : DEFAULT_TOPIC_TIME_WINDOW);
  const windowSummary = topicTimeWindowSummary(timeWindow);
  const now = new Date();
  const createdAtWindow = topicCreatedAtWindow(timeWindow, now);
  const entryQuery = (query.q ?? "").normalize("NFKC").trim().slice(0, 100);
  if (reference.kind === "legacy" || segment !== `${topic.slug}--${topic.publicId}`) {
    permanentRedirect(
      topicUrlWithQuery(topic.url, {
        ...(query.sort === "oldest" || query.sort === "newest" || query.sort === "top"
          ? { sort }
          : {}),
        ...(timeWindow === DEFAULT_TOPIC_TIME_WINDOW ? {} : { window: timeWindow }),
        ...(page > 1 ? { page } : {}),
        ...(entryQuery ? { query: entryQuery } : {}),
      }),
    );
  }
  const topicId = topic.id;
  const pageSize = 20;
  const database = getDatabase();
  let rateLimited = false;
  let result: Awaited<ReturnType<typeof getTopicEntries>>;
  try {
    if (entryQuery) {
      const requestHeaders = await headers();
      await enforceRateLimit(
        database,
        session
          ? userRateLimitIdentifier(session.userId)
          : ipRateLimitIdentifier(requestIp({ headers: requestHeaders })),
        session ? RATE_LIMIT_RULES.searchAuthenticated : RATE_LIMIT_RULES.searchVisitor,
      );
    }
    result = await getTopicEntries(database, {
      topicId,
      viewer,
      page,
      pageSize,
      skip: (page - 1) * pageSize,
      sort,
      ...(createdAtWindow ? { createdAtWindow } : {}),
      ...(entryQuery ? { query: entryQuery } : {}),
    });
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "RATE_LIMITED") throw error;
    rateLimited = true;
    result = { entries: [], totalItems: 0 };
  }
  const entryIds = result.entries.map((entry) => entry.id);
  const [[votes, bookmarks], references, canGammaz] = await Promise.all([
    session && entryIds.length > 0
      ? getViewerEntryStates(database, session.userId, entryIds)
      : Promise.resolve([[], []] as const),
    getEntryReferenceIndex(
      database,
      result.entries.map((entry) => entry.body),
    ),
    session?.user.status === "ACTIVE"
      ? userHasModerationCapability(database, session.userId, "GAMMAZ")
      : Promise.resolve(false),
  ]);
  const voteMap = new Map(
    votes.map((vote) => [vote.entryId, vote.value === 1 ? (1 as const) : (-1 as const)]),
  );
  const bookmarkSet = new Set(bookmarks.map((bookmark) => bookmark.entryId));
  const totalPages = Math.max(1, Math.ceil(result.totalItems / pageSize));
  const appUrl = getEnvironment().APP_URL;
  return (
    <main id="ana-icerik" className="page-main">
      <JsonLd
        data={buildTopicJsonLd({
          baseUrl: appUrl,
          url: topic.url,
          title: topic.title,
          entryCount: topic.entryCount,
          createdAt: topic.createdAt,
          updatedAt: topic.updatedAt,
          author: topic.createdBy,
          entries: result.entries
            .filter((entry) => entry.status === "ACTIVE")
            .map((entry) => ({
              url: entryPublicUrl(entry),
              body: entry.body,
              createdAt: entry.createdAt,
              updatedAt: entry.updatedAt,
              author: entry.author,
            })),
        })}
      />
      {/*
        Başlık bloğu iki satır: kimlik satırı (başlık + takip + ⋮) ve kontrol
        satırı (sıralama + arama + pencere). Eskiden altı satırdı ve ilk entry
        katlamanın altına düşüyordu; okuma ürününde başlıkla ilk cümle arasına
        altı satırlık denetim koymanın karşılığı yok.

        Kontrollerin hiçbiri JS'e bağlı değil: sıralama ve pencere düz `<a href>`,
        arama `<form method="get">`. Pencere menüsü Radix değil `<details>` — JS
        kapalıyken de açılır.
      */}
      <header className="mb-6">
        <p className="eyebrow">
          {windowSummary
            ? `${result.totalItems} entry · ${windowSummary}`
            : `${topic.entryCount} entry`}
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h1 className="title-page">{topic.title}</h1>
          <div className="flex shrink-0 items-center gap-2">
            {topic.status === "HIDDEN" ? (
              <span className="rounded bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive">
                gizlenmiş başlık
              </span>
            ) : null}
            {session?.user.status === "ACTIVE" && topic.status === "ACTIVE" ? (
              <TopicFollowButton topicId={topicId} initialFollowed={topic.following} />
            ) : null}
            {/*
              Paylaşım kendi ikonunda, ⋮'den ayrı — ⋮ yalnız moderasyona ait
              (`docs/BENCHMARK_GIRISLI_2026-08-20.md` §2). Gizlenmiş/birleştirilmiş
              başlığı dışarıya özetletmenin ya da paylaştırmanın anlamı yok, ikisi
              de aynı koşulun arkasında.
            */}
            {topic.status === "ACTIVE" ? (
              <>
                <TopicShareMenu title={topic.title} url={absolutePublicUrl(appUrl, topic.url)} />
                <TopicOverflowMenu
                  topicId={topicId}
                  canReport={canGammaz && session?.userId !== topic.createdById}
                />
              </>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {/*
            Sıralama en sık kullanılan kontrol; menüye kapanmıyor. `chip` yerine
            düz metin linkleri: üç kutu yerine bir satır metin, aktif olan renkle
            ayrılıyor. Dokunma hedefi `min-h-9` ile 36px kalıyor (SC 2.5.8).
          */}
          <nav
            aria-label="Entry sıralaması"
            className="flex flex-wrap items-center gap-x-2 text-sm"
          >
            {(["oldest", "newest", "top"] as const).map((value, index) => (
              <Fragment key={value}>
                {index > 0 ? (
                  <span aria-hidden="true" className="text-muted">
                    ·
                  </span>
                ) : null}
                <a
                  href={topicUrlWithQuery(topic.url, {
                    sort: value,
                    window: timeWindow,
                    query: entryQuery || undefined,
                  })}
                  aria-current={sort === value ? "page" : undefined}
                  className={`inline-flex min-h-9 items-center whitespace-nowrap ${
                    sort === value ? "font-medium text-primary" : "text-muted hover:text-ink"
                  }`}
                >
                  {value === "oldest"
                    ? "Eskiden yeniye"
                    : value === "newest"
                      ? "Yeniden eskiye"
                      : "En yüksek puan"}
                </a>
              </Fragment>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <form action={topic.url} method="get" role="search" className="flex items-center gap-1">
              <label htmlFor="topic-entry-search" className="sr-only">
                Başlık içinde ara
              </label>
              <input type="hidden" name="sort" value={sort} />
              {timeWindow === DEFAULT_TOPIC_TIME_WINDOW ? null : (
                <input type="hidden" name="window" value={timeWindow} />
              )}
              <input
                id="topic-entry-search"
                name="q"
                type="search"
                defaultValue={entryQuery}
                maxLength={100}
                placeholder="başlıkta ara"
                className="min-h-9 w-36 min-w-0 rounded border field-border bg-page px-3 text-sm sm:w-44"
              />
              {/*
                Enter zaten gönderiyor; düğme dokunmalı kullanım ve görünür
                gönderim işareti için var, etiketi ekran okuyucuya `aria-label`
                ile veriliyor.
              */}
              <button
                type="submit"
                aria-label="Başlıkta ara"
                className="chip w-9 justify-center px-0 text-ink"
              >
                <Search aria-hidden="true" size={16} />
              </button>
            </form>
            {/*
              Arama aktifken çıkış yolu görünür kalmalı: kullanıcı filtrelenmiş
              listeye bakarken sebebini ve nasıl geri döneceğini görmeli.
            */}
            {entryQuery ? (
              <a
                href={topicUrlWithQuery(topic.url, { sort, window: timeWindow })}
                className="inline-flex min-h-9 items-center whitespace-nowrap text-sm text-muted underline hover:text-ink"
              >
                Aramayı temizle
              </a>
            ) : null}
            <nav aria-label="Zaman penceresi" className="shrink-0">
              <TopicWindowMenu
                triggerLabel={windowSummary ?? "tüm zamanlar"}
                filtered={timeWindow !== DEFAULT_TOPIC_TIME_WINDOW}
                options={TOPIC_TIME_WINDOWS.map((value) => ({
                  value,
                  label: topicTimeWindowLabel(value),
                  href: topicUrlWithQuery(topic.url, {
                    sort,
                    window: value,
                    query: entryQuery || undefined,
                  }),
                  current: timeWindow === value,
                }))}
              />
            </nav>
          </div>
        </div>
      </header>
      {/* Ritmi boşluk değil ayraç kuruyor: her `EntryPreview` üstünde `border-t`
          taşıyor, bu yüzden sarmalayıcıda `space-y-*` yok. */}
      <div>
        {result.entries.map((entry) => (
          <EntryPreview
            key={entry.id}
            entry={entry}
            references={references}
            showTopicTitle={false}
            guestActions={!session}
            {...(session?.user.status === "ACTIVE"
              ? {
                  actions: {
                    vote: voteMap.get(entry.id) ?? null,
                    bookmarked: bookmarkSet.has(entry.id),
                    canEdit:
                      entry.authorId === session.userId &&
                      entry.status === "ACTIVE" &&
                      entry.origin !== "SEED",
                    canReport:
                      canGammaz && entry.status === "ACTIVE" && entry.authorId !== session.userId,
                    canBlockAuthor: entry.authorId !== session.userId,
                  },
                }
              : {})}
          />
        ))}
        {rateLimited ? (
          <p className="surface-card mt-4 p-6 text-muted" role="status">
            Arama sınırına ulaştınız; lütfen kısa süre sonra yeniden deneyin.
          </p>
        ) : result.entries.length === 0 ? (
          <p className="surface-card p-6 text-muted">
            {entryQuery
              ? "Bu aramayla eşleşen aktif entry yok."
              : windowSummary
                ? `Bu başlıkta ${windowSummary} içinde görüntülenebilen entry yok.`
                : "Bu başlıkta görüntülenebilen entry yok."}
          </p>
        ) : null}
      </div>
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(next) =>
          topicUrlWithQuery(topic.url, {
            sort,
            window: timeWindow,
            page: next,
            query: entryQuery || undefined,
          })
        }
      />
      {topic.status !== "ACTIVE" ? null : session?.user.status === "ACTIVE" &&
        session.user.writerApproved ? (
        <CreateEntryForm topicId={topicId} />
      ) : !session ? (
        <div className="surface-card mt-8 p-6">
          <p className="text-muted">Bu başlığa yazmak için giriş yapın.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href="/kayit" className="button-primary">
              Kayıt ol
            </a>
            <a href={`/giris?next=${encodeURIComponent(topic.url)}`} className="button-secondary">
              Giriş
            </a>
          </div>
        </div>
      ) : session.user.status === "ACTIVE" ? (
        <p className="surface-card mt-8 p-6 text-muted">
          Yazar hesabınız admin onayı bekliyor. Onaydan sonra entry yazabilirsiniz.
        </p>
      ) : (
        <p className="surface-card mt-8 p-6 text-destructive">
          Askıya alınmış hesapla içerik oluşturamazsınız.
        </p>
      )}
    </main>
  );
}
