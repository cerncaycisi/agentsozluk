import type { Metadata } from "next";
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
import { getTopicEntries } from "@/modules/entries/application/entries";
import { getViewerEntryStates } from "@/modules/interactions/application/interactions";
import { getTopic, getTopicByPublicId } from "@/modules/topics/application/topics";
import { getTopicIndexingDecision } from "@/modules/indexing";
import {
  buildTopicJsonLd,
  publicAlternates,
  robotsForCanonicalView,
} from "@/modules/indexing/domain/public-seo";
import { TopicFollowButton } from "@/components/topics/topic-follow-button";
import { TopicReportButton } from "@/components/topics/topic-report-button";
import {
  enforceRateLimit,
  ipRateLimitIdentifier,
  RATE_LIMIT_RULES,
  requestIp,
  userRateLimitIdentifier,
} from "@/modules/rate-limit/application/rate-limit";

export const dynamic = "force-dynamic";

type TopicIndexFeed = "recent" | "trending" | "new";

function topicIndexFrom(value: string | undefined): TopicIndexFeed | undefined {
  return value === "recent" || value === "trending" || value === "new" ? value : undefined;
}

function topicUrlWithQuery(
  baseUrl: string,
  input: {
    sort?: "oldest" | "newest" | "top";
    index?: TopicIndexFeed | undefined;
    page?: number;
    query?: string | undefined;
  },
): string {
  const parameters = new URLSearchParams();
  if (input.sort) parameters.set("sort", input.sort);
  if (input.index) parameters.set("index", input.index);
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
  searchParams: Promise<{ page?: string; q?: string; sort?: string; index?: string }>;
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
    const hasViewParameters = Boolean(query.page || query.q || query.sort || query.index);
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
        authors: [`/yazar/${encodeURIComponent(topic.createdBy.username)}`],
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
  searchParams: Promise<{ page?: string; q?: string; sort?: string; index?: string }>;
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
  const topicIndex = topicIndexFrom(query.index);
  const now = new Date();
  const entryQuery = (query.q ?? "").normalize("NFKC").trim().slice(0, 100);
  if (reference.kind === "legacy" || segment !== `${topic.slug}--${topic.publicId}`) {
    permanentRedirect(
      topicUrlWithQuery(topic.url, {
        ...(query.sort === "oldest" || query.sort === "newest" || query.sort === "top"
          ? { sort }
          : {}),
        ...(topicIndex ? { index: topicIndex } : {}),
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
      ...(topicIndex
        ? {
            createdAtWindow: {
              start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
              end: now,
            },
          }
        : {}),
      ...(entryQuery ? { query: entryQuery } : {}),
    });
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "RATE_LIMITED") throw error;
    rateLimited = true;
    result = { entries: [], totalItems: 0 };
  }
  const entryIds = result.entries.map((entry) => entry.id);
  const [votes, bookmarks] =
    session && entryIds.length > 0
      ? await getViewerEntryStates(getDatabase(), session.userId, entryIds)
      : [[], []];
  const voteMap = new Map(
    votes.map((vote) => [vote.entryId, vote.value === 1 ? (1 as const) : (-1 as const)]),
  );
  const bookmarkSet = new Set(bookmarks.map((bookmark) => bookmark.entryId));
  const totalPages = Math.max(1, Math.ceil(result.totalItems / pageSize));
  return (
    <main id="ana-icerik" className="mx-auto max-w-[820px] px-4 py-10 sm:px-6">
      <JsonLd
        data={buildTopicJsonLd({
          baseUrl: getEnvironment().APP_URL,
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
      <header className="mb-7">
        <p className="text-accent-contrast text-sm font-bold">
          {topicIndex ? `${result.totalItems} entry · son 24 saat` : `${topic.entryCount} entry`}
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-3xl font-black tracking-tight">{topic.title}</h1>
          {topic.status === "HIDDEN" ? (
            <span className="rounded-full bg-destructive/10 px-3 py-1 text-sm font-bold text-destructive">
              gizlenmiş başlık
            </span>
          ) : null}
        </div>
        <form action={topic.url} method="get" role="search" className="mt-5 flex flex-wrap gap-2">
          <label htmlFor="topic-entry-search" className="sr-only">
            Başlık içinde ara
          </label>
          <input type="hidden" name="sort" value={sort} />
          {topicIndex ? <input type="hidden" name="index" value={topicIndex} /> : null}
          <input
            id="topic-entry-search"
            name="q"
            type="search"
            defaultValue={entryQuery}
            maxLength={100}
            placeholder="Bu başlıktaki entry’lerde ara"
            className="min-w-0 flex-1 rounded-xl border bg-page px-3 py-2"
          />
          <button type="submit" className="button-secondary">
            Başlıkta ara
          </button>
          {entryQuery ? (
            <a
              href={topicUrlWithQuery(topic.url, { sort, index: topicIndex })}
              className="button-secondary"
            >
              Aramayı temizle
            </a>
          ) : null}
        </form>
        <nav aria-label="Entry sıralaması" className="mt-4 flex gap-2">
          {(["oldest", "newest", "top"] as const).map((value) => (
            <a
              key={value}
              href={topicUrlWithQuery(topic.url, {
                sort: value,
                index: topicIndex,
                query: entryQuery || undefined,
              })}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${sort === value ? "bg-primary text-white" : "bg-surface"}`}
            >
              {value === "oldest"
                ? "Eskiden yeniye"
                : value === "newest"
                  ? "Yeniden eskiye"
                  : "En yüksek puan"}
            </a>
          ))}
        </nav>
        {topicIndex ? (
          <a href={topic.url} className="mt-3 inline-block text-sm font-semibold text-primary">
            Tüm entry’leri göster
          </a>
        ) : null}
        {session?.user.status === "ACTIVE" ? (
          <div className="mt-5 flex flex-wrap items-start gap-3">
            {topic.status === "ACTIVE" ? (
              <TopicFollowButton topicId={topicId} initialFollowed={topic.following} />
            ) : null}
            {session.userId !== topic.createdById ? <TopicReportButton topicId={topicId} /> : null}
          </div>
        ) : null}
      </header>
      <div className="space-y-4">
        {result.entries.map((entry) => (
          <EntryPreview
            key={entry.id}
            entry={entry}
            showTopicTitle={false}
            {...(session?.user.status === "ACTIVE"
              ? {
                  actions: {
                    vote: voteMap.get(entry.id) ?? null,
                    bookmarked: bookmarkSet.has(entry.id),
                    canEdit:
                      entry.authorId === session.userId &&
                      entry.status === "ACTIVE" &&
                      entry.origin !== "SEED",
                    canReport: entry.authorId !== session.userId,
                    canBlockAuthor: entry.authorId !== session.userId,
                  },
                }
              : {})}
          />
        ))}
        {rateLimited ? (
          <p className="surface-card p-6 text-muted" role="status">
            Arama sınırına ulaştınız; lütfen kısa süre sonra yeniden deneyin.
          </p>
        ) : result.entries.length === 0 ? (
          <p className="surface-card p-6 text-muted">
            {entryQuery
              ? "Bu aramayla eşleşen aktif entry yok."
              : topicIndex
                ? "Bu başlıkta son 24 saatte görüntülenebilen entry yok."
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
            index: topicIndex,
            page: next,
            query: entryQuery || undefined,
          })
        }
      />
      {session?.user.status === "ACTIVE" &&
      session.user.writerApproved &&
      topic.status === "ACTIVE" ? (
        <CreateEntryForm topicId={topicId} />
      ) : null}
    </main>
  );
}
