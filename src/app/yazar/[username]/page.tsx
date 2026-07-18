import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntryPreview } from "@/components/entries/entry-preview";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { pageFrom } from "@/lib/http/pagination";
import { getPublicProfile } from "@/modules/users/application/profiles";
import { currentPageSession } from "@/lib/auth/server-session";
import { ProfileActions } from "@/components/users/profile-actions";
import { getBlockState, getUserFollowState } from "@/modules/interactions/application/interactions";
import { getProfileIndexingDecision } from "@/modules/indexing";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const indexing = await getProfileIndexingDecision(getDatabase(), username);
  return {
    title: `@${username}`,
    robots: { index: indexing.index, follow: indexing.follow },
  };
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { username } = await params;
  const page = pageFrom((await searchParams).page);
  const pageSize = 20;
  let result;
  try {
    result = await getPublicProfile(getDatabase(), {
      username,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "USER_NOT_FOUND") notFound();
    throw error;
  }
  const totalPages = Math.max(1, Math.ceil(result.totalItems / pageSize));
  const session = await currentPageSession();
  const ownProfile = session?.userId === result.profile.id;
  const [blocked, followed] =
    session && !ownProfile
      ? await Promise.all([
          getBlockState(getDatabase(), session.userId, result.profile.id),
          getUserFollowState(getDatabase(), session.userId, result.profile.id).then(
            (state) => state.followed,
          ),
        ])
      : [false, false];
  return (
    <main id="ana-icerik" className="mx-auto max-w-[820px] px-4 py-10 sm:px-6">
      <header className="surface-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">{result.profile.displayName}</h1>
            <p className="mt-1 font-semibold text-primary">@{result.profile.username}</p>
          </div>
          {result.profile.status === "SUSPENDED" ? (
            <span className="rounded-full bg-destructive/10 px-3 py-1 text-sm font-bold text-destructive">
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
            <dd className="text-lg font-bold">{result.profile.activeEntryCount}</dd>
          </div>
          <div>
            <dt className="text-muted">Açtığı aktif başlık</dt>
            <dd className="text-lg font-bold">{result.profile.openedActiveTopicCount}</dd>
          </div>
          <div>
            <dt className="text-muted">Katılım</dt>
            <dd className="text-lg font-bold">
              {result.profile.createdAt.toLocaleDateString("tr-TR")}
            </dd>
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
      <section aria-labelledby="son-entryler" className="mt-10">
        <h2 id="son-entryler" className="text-2xl font-black">
          Son entry’ler
        </h2>
        <div className="mt-5 space-y-4">
          {result.entries.map((entry) => (
            <EntryPreview
              key={entry.id}
              entry={{
                ...entry,
                author: {
                  id: result.profile.id,
                  username: result.profile.username,
                  displayName: result.profile.displayName,
                },
              }}
            />
          ))}
          {result.entries.length === 0 ? (
            <p className="surface-card p-6 text-muted">Görüntülenebilen aktif entry bulunmuyor.</p>
          ) : null}
        </div>
      </section>
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(next) => `/yazar/${result.profile.username}?page=${next}`}
      />
    </main>
  );
}
