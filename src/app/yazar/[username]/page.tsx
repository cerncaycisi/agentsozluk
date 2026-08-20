import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { EntryPreview } from "@/components/entries/entry-preview";
import { JsonLd } from "@/components/seo/json-ld";
import { TopicList } from "@/components/topics/topic-list";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { getDatabase } from "@/lib/db/client";
import { getEnvironment } from "@/config/env";
import { formatIstanbulDate } from "@/lib/format/time";
import { AppError } from "@/lib/http/errors";
import { pageFrom } from "@/lib/http/pagination";
import { getPublicProfile } from "@/modules/users/application/profiles";
import { currentPageSession } from "@/lib/auth/server-session";
import { ProfileActions } from "@/components/users/profile-actions";
import {
  getBlockState,
  getUserFollowState,
  getViewerEntryStates,
} from "@/modules/interactions/application/interactions";
import { userHasModerationCapability } from "@/modules/moderation/application/capabilities";
import { getProfileIndexingDecision } from "@/modules/indexing";
import {
  buildProfileJsonLd,
  publicAlternates,
  publicExcerpt,
  publicProfileUrl,
  robotsForCanonicalView,
} from "@/modules/indexing/domain/public-seo";
import { getEntryReferenceIndex } from "@/modules/entries";

export const dynamic = "force-dynamic";

/**
 * Sekmeler sunucu tarafında, URL üzerinden çözülür: paylaşılan bağlantı doğru
 * sekmeyi açar, geri tuşu tarayıcı geçmişinden çalışır ve JS kapalıyken de
 * gezinilir. `entryler` varsayılan olduğu için URL'de taşınmaz.
 */
type ProfileTabParameter = "entryler" | "basliklar";

function profileTabFrom(value: string | undefined): ProfileTabParameter {
  return value === "basliklar" ? "basliklar" : "entryler";
}

function profileUrlWithQuery(
  baseUrl: string,
  input: { tab: ProfileTabParameter; page?: number },
): string {
  const parameters = new URLSearchParams();
  if (input.tab !== "entryler") parameters.set("tab", input.tab);
  if (input.page && input.page > 1) parameters.set("page", String(input.page));
  const query = parameters.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ page?: string; tab?: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const query = await searchParams;
  try {
    const [indexing, result] = await Promise.all([
      getProfileIndexingDecision(getDatabase(), username),
      getPublicProfile(getDatabase(), { username, skip: 0, take: 1 }),
    ]);
    const profile = result.profile;
    const canonical = publicProfileUrl(profile.username);
    const description = profile.bio
      ? publicExcerpt(profile.bio)
      : `${profile.displayName} tarafından yazılan ${profile.activeEntryCount} aktif entry.`;
    return {
      title: profile.displayName,
      description,
      alternates: publicAlternates(canonical, canonical),
      openGraph: { title: profile.displayName, description, type: "profile", url: canonical },
      robots: robotsForCanonicalView(indexing, Boolean(query.page || query.tab)),
    };
  } catch {
    return { title: "Yazar bulunamadı", robots: { index: false, follow: false } };
  }
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const { username } = await params;
  const query = await searchParams;
  const page = pageFrom(query.page);
  const tabParameter = profileTabFrom(query.tab);
  const pageSize = 20;
  let result;
  try {
    result = await getPublicProfile(getDatabase(), {
      username,
      skip: (page - 1) * pageSize,
      take: pageSize,
      tab: tabParameter === "basliklar" ? "topics" : "entries",
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "USER_NOT_FOUND") notFound();
    throw error;
  }
  const profileUrl = publicProfileUrl(result.profile.username);
  if (username !== result.profile.publicSlug)
    permanentRedirect(profileUrlWithQuery(profileUrl, { tab: tabParameter, page }));
  const totalPages = Math.max(1, Math.ceil(result.totalItems / pageSize));
  const tabs = [
    {
      value: "entryler",
      label: `Entry’ler (${result.profile.activeEntryCount})`,
      heading: "Entry’ler",
    },
    {
      value: "basliklar",
      label: `Açtığı başlıklar (${result.profile.openedActiveTopicCount})`,
      heading: "Açtığı başlıklar",
    },
  ] as const satisfies ReadonlyArray<{
    value: ProfileTabParameter;
    label: string;
    heading: string;
  }>;
  const session = await currentPageSession();
  const ownProfile = session?.userId === result.profile.id;
  /**
   * Sabit sorgu bütçesi: referans indeksi + (oturumluysa) engel/takip durumu,
   * sayfadaki TÜM entry id'leri için tek oy/favori sorgusu ve gammaz yetkisi.
   * Profildeki bütün entry'ler aynı yazara ait olduğu için engel bilgisi tek
   * `getBlockState` çağrısından geliyor — yazar başına sorgu yok.
   */
  const entryIds = result.entries.map((entry) => entry.id);
  const database = getDatabase();
  const [references, [blocked, followed], [votes, bookmarks], canGammaz] = await Promise.all([
    getEntryReferenceIndex(
      database,
      result.entries.map((entry) => entry.body),
    ),
    session && !ownProfile
      ? Promise.all([
          getBlockState(database, session.userId, result.profile.id),
          getUserFollowState(database, session.userId, result.profile.id).then(
            (state) => state.followed,
          ),
        ])
      : Promise.resolve([false, false] as const),
    session && entryIds.length > 0
      ? getViewerEntryStates(database, session.userId, entryIds)
      : Promise.resolve([[], []] as const),
    session?.user.status === "ACTIVE"
      ? userHasModerationCapability(database, session.userId, "GAMMAZ")
      : Promise.resolve(false),
  ]);
  const voteMap = new Map(
    votes.map((vote) => [vote.entryId, vote.value === 1 ? (1 as const) : (-1 as const)]),
  );
  const bookmarkSet = new Set(bookmarks.map((bookmark) => bookmark.entryId));
  return (
    <main id="ana-icerik" className="page-main">
      <JsonLd
        data={buildProfileJsonLd({
          baseUrl: getEnvironment().APP_URL,
          username: result.profile.username,
          displayName: result.profile.displayName,
          bio: result.profile.bio,
          createdAt: result.profile.createdAt,
        })}
      />
      <header className="surface-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="title-page">{result.profile.displayName}</h1>
          </div>
          {result.profile.status === "SUSPENDED" ? (
            <span className="rounded bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive">
              askıya alınmış hesap
            </span>
          ) : null}
        </div>
        {result.profile.bio ? (
          <p className="mt-5 whitespace-pre-wrap leading-7">{result.profile.bio}</p>
        ) : null}
        <dl className="mt-6 grid gap-4 border-t pt-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Aktif entry</dt>
            <dd className="text-lg font-medium">{result.profile.activeEntryCount}</dd>
          </div>
          <div>
            <dt className="text-muted">Açtığı aktif başlık</dt>
            <dd className="text-lg font-medium">{result.profile.openedActiveTopicCount}</dd>
          </div>
          <div>
            <dt className="text-muted">Katılım</dt>
            <dd className="text-lg font-medium">{formatIstanbulDate(result.profile.createdAt)}</dd>
          </div>
        </dl>
        {session && !ownProfile && session.user.status === "ACTIVE" ? (
          <ProfileActions
            userId={result.profile.id}
            username={result.profile.username}
            initialBlocked={blocked}
            initialFollowed={followed}
            canModerate={session.user.role === "MODERATOR" || session.user.role === "ADMIN"}
          />
        ) : null}
      </header>
      <nav aria-label="Profil sekmeleri" className="mt-8 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <Link
            key={item.value}
            href={profileUrlWithQuery(profileUrl, { tab: item.value })}
            {...(item.value === tabParameter ? { "aria-current": "page" as const } : {})}
            className={`chip${item.value === tabParameter ? " chip-active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <section aria-labelledby="profil-sekme-basligi" className="mt-6">
        <h2 id="profil-sekme-basligi" className="sr-only">
          {tabs.find((item) => item.value === tabParameter)?.heading}
        </h2>
        {tabParameter === "basliklar" ? (
          <TopicList
            topics={result.topics}
            emptyMessage="Bu yazarın açtığı aktif başlık bulunmuyor."
          />
        ) : (
          /* Ritim `EntryPreview`'ın üst ayracından geliyor; `space-y-*` eklenirse
             boşluk ikiye katlanır. */
          <div>
            {result.entries.map((entry) => (
              <EntryPreview
                key={entry.id}
                entry={{
                  ...entry,
                  blockedByViewer: blocked,
                  author: {
                    id: result.profile.id,
                    username: result.profile.username,
                    displayName: result.profile.displayName,
                  },
                }}
                references={references}
                collapsible
                guestActions={!session}
                {...(session?.user.status === "ACTIVE"
                  ? {
                      actions: {
                        vote: voteMap.get(entry.id) ?? null,
                        bookmarked: bookmarkSet.has(entry.id),
                        canEdit: ownProfile && entry.status === "ACTIVE" && entry.editableByAuthor,
                        canReport: canGammaz && entry.status === "ACTIVE" && !ownProfile,
                        canBlockAuthor: !ownProfile,
                      },
                    }
                  : {})}
              />
            ))}
            {result.entries.length === 0 ? (
              <p className="surface-card p-6 text-muted">
                Görüntülenebilen aktif entry bulunmuyor.
              </p>
            ) : null}
          </div>
        )}
      </section>
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(next) => profileUrlWithQuery(profileUrl, { tab: tabParameter, page: next })}
      />
    </main>
  );
}
