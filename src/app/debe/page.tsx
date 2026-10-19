import type { Metadata } from "next";
import Link from "next/link";
import { EntryPreview } from "@/components/entries/entry-preview";
import { currentPageSession } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { formatIstanbulDate } from "@/lib/format/time";
import { getDebe } from "@/modules/feeds/application/feeds";
import { previousIstanbulDayWindow } from "@/modules/feeds/domain/time";
import { publicListMetadata } from "@/modules/indexing/domain/public-seo";
import {
  getEntryReferenceIndex,
  getEntrySourceLinks,
  getEntryTopicLocations,
} from "@/modules/entries";
import { entrySignalCohort, entrySignalUrl } from "@/modules/indexing/domain/entry-signal-cohort";
import {
  getBlockedAuthorIds,
  getViewerEntryStates,
} from "@/modules/interactions/application/interactions";
import { userHasModerationCapability } from "@/modules/moderation/application/capabilities";

export const dynamic = "force-dynamic";
export const metadata: Metadata = publicListMetadata({
  title: "DEBE",
  canonical: "/debe",
  description: "Europe/Istanbul takvimine göre dün yazılmış, pozitif puanlı entry’ler.",
});

export default async function DebePage() {
  const database = getDatabase();
  const now = new Date();
  const debeDay = previousIstanbulDayWindow(now).start;
  const formattedDebeDay = formatIstanbulDate(debeDay);
  const [session, entries] = await Promise.all([currentPageSession(), getDebe(database, now)]);
  /**
   * Sayfa başına sabit sorgu bütçesi: entry listesi + referans indeksi + (oturumluysa)
   * oy/favori durumları, engellenen yazarlar ve gammaz yetkisi. Hepsi sayfadaki bütün
   * entry/yazar id'lerini tek seferde alır; entry başına sorgu açılmaz. Entry sinyal
   * kohortunun (`entry-signal-cohort.ts`) deney başlıklarındaki entry'lerin başlıktaki yeri
   * de tek sorguda gelir; sıra numarası bağlantısı oraya gider.
   */
  const entryIds = entries.map((entry) => entry.id);
  const authorIds = [...new Set(entries.map((entry) => entry.author.id))];
  const signalEntryIds = entries
    .filter((entry) => entrySignalCohort(entry.topic.publicId) === "treatment")
    .map((entry) => entry.id);
  const [references, [votes, bookmarks], blockedAuthorIds, canGammaz, sourceLinks, locations] =
    await Promise.all([
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
      getEntrySourceLinks(database, entryIds),
      getEntryTopicLocations(database, signalEntryIds),
    ]);
  const voteMap = new Map(
    votes.map((vote) => [vote.entryId, vote.value === 1 ? (1 as const) : (-1 as const)]),
  );
  const bookmarkSet = new Set(bookmarks.map((bookmark) => bookmark.entryId));
  return (
    <main id="ana-icerik" tabIndex={-1} className="page-main">
      <header className="mb-8">
        <h1 className="title-page">Dünün en beğenilen entry’leri</h1>
        <p className="eyebrow mt-2">{formattedDebeDay}</p>
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
                href={entrySignalUrl({
                  topic: entry.topic,
                  entry,
                  page: locations.get(entry.id)?.page,
                })}
                aria-label={`DEBE ${index + 1}. sıradaki entry’ye git`}
                className="text-accent-contrast mb-1 inline-flex min-h-6 min-w-6 items-center justify-center text-sm font-semibold hover:underline sm:mb-0 sm:shrink-0"
              >
                #{index + 1}
              </Link>
              <div className="min-w-0 sm:flex-1">
                <EntryPreview
                  entry={{ ...entry, blockedByViewer: blockedAuthorIds.has(entry.author.id) }}
                  references={references}
                  sourceLinks={sourceLinks.get(entry.id)}
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
