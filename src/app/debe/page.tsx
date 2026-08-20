import type { Metadata } from "next";
import Link from "next/link";
import { EntryPreview } from "@/components/entries/entry-preview";
import { currentPageSession } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { formatIstanbulDate } from "@/lib/format/time";
import { entryPublicUrl } from "@/lib/routing/public-urls";
import { getDebe } from "@/modules/feeds/application/feeds";
import { previousIstanbulDayWindow } from "@/modules/feeds/domain/time";
import { publicAlternates } from "@/modules/indexing/domain/public-seo";
import { getEntryReferenceIndex } from "@/modules/entries";
import {
  getBlockedAuthorIds,
  getViewerEntryStates,
} from "@/modules/interactions/application/interactions";
import { userHasModerationCapability } from "@/modules/moderation/application/capabilities";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "DEBE", alternates: publicAlternates("/debe") };

export default async function DebePage() {
  const database = getDatabase();
  const now = new Date();
  const debeDay = previousIstanbulDayWindow(now).start;
  const formattedDebeDay = formatIstanbulDate(debeDay);
  const [session, entries] = await Promise.all([currentPageSession(), getDebe(database, now)]);
  /**
   * Sayfa başına sabit sorgu bütçesi: entry listesi + referans indeksi + (oturumluysa)
   * oy/favori durumları, engellenen yazarlar ve gammaz yetkisi. Hepsi sayfadaki bütün
   * entry/yazar id'lerini tek seferde alır; entry başına sorgu açılmaz.
   */
  const entryIds = entries.map((entry) => entry.id);
  const authorIds = [...new Set(entries.map((entry) => entry.author.id))];
  const [references, [votes, bookmarks], blockedAuthorIds, canGammaz] = await Promise.all([
    getEntryReferenceIndex(
      database,
      entries.map((entry) => entry.body),
    ),
    session && entryIds.length > 0
      ? getViewerEntryStates(database, session.userId, entryIds)
      : Promise.resolve([[], []] as const),
    session
      ? getBlockedAuthorIds(database, session.userId, authorIds)
      : Promise.resolve(new Set<string>()),
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
      <header className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">Dünün en beğenilen entry’leri</h1>
        <p className="text-accent-contrast mt-2 text-sm font-bold">{formattedDebeDay}</p>
        <p className="mt-3 leading-7 text-muted">
          Europe/Istanbul takvimine göre dün yazılmış, pozitif puanlı entry’ler.
        </p>
      </header>
      {entries.length === 0 ? (
        <p className="surface-card p-6 text-muted">Dün için pozitif puanlı entry bulunmuyor.</p>
      ) : (
        /* Ayraç `li`'de, entry'de değil: sıra numarası çizginin solunda kalmalı,
           yoksa çizgi numara sütununun sağından başlar. `EntryPreview` bu yüzden
           `divider={false}` ile kendi çizgisini ve dikey boşluğunu bırakır. */
        <ol>
          {entries.map((entry, index) => (
            <li key={entry.id} className="border-t py-4 sm:flex sm:items-start sm:gap-3">
              <Link
                href={entryPublicUrl(entry)}
                aria-label={`DEBE ${index + 1}. sıradaki entry’ye git`}
                className="text-accent-contrast mb-1 inline-flex min-h-6 min-w-6 items-center justify-center text-sm font-bold hover:underline sm:mb-0 sm:shrink-0"
              >
                #{index + 1}
              </Link>
              <div className="min-w-0 sm:flex-1">
                <EntryPreview
                  entry={{ ...entry, blockedByViewer: blockedAuthorIds.has(entry.author.id) }}
                  references={references}
                  divider={false}
                  collapsible
                  guestActions={!session}
                  {...(session?.user.status === "ACTIVE"
                    ? {
                        actions: {
                          vote: voteMap.get(entry.id) ?? null,
                          bookmarked: bookmarkSet.has(entry.id),
                          canEdit:
                            entry.author.id === session.userId &&
                            entry.status === "ACTIVE" &&
                            entry.origin !== "SEED",
                          canReport:
                            canGammaz &&
                            entry.status === "ACTIVE" &&
                            entry.author.id !== session.userId,
                          canBlockAuthor: entry.author.id !== session.userId,
                        },
                      }
                    : {})}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
