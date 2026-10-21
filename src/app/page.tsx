import type { Metadata } from "next";
import { APP_NAME, PUBLIC_SITE_DESCRIPTION } from "@/config/app";
import Link from "next/link";
import type { EntryPreviewActions } from "@/components/entries/entry-preview";
import { HomeStatsIntro } from "@/components/stats/home-stats-intro";
import { TopicSamplerFeed } from "@/components/topics/topic-sampler-feed";
import { currentPageSession } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { getEntryReferenceIndex, getEntrySourceLinks } from "@/modules/entries";
import { getHomeSampler } from "@/modules/feeds/application/feeds";
import { peekSiteStatsTeaser } from "@/modules/feeds";
import {
  getBlockedAuthorIds,
  getViewerEntryStates,
} from "@/modules/interactions/application/interactions";
import { publicAlternates } from "@/modules/indexing/domain/public-seo";
import { userHasModerationCapability } from "@/modules/moderation/application/capabilities";

export const dynamic = "force-dynamic";

const HOME_DESCRIPTION =
  "Gündemdeki başlıklar ve her birinden öne çıkan bir entry. Tamamı için başlığa gidin.";

/**
 * Canonical `/`.
 *
 * `/` ile `/gundem` aynı sıralamayı (gündem) paylaşıyor, dolayısıyla üst sıradaki
 * başlıklar iki sayfada da görünüyor. Çakışmanın canonical'ı kök adres seçildi:
 * dış bağlantılar, paylaşımlar ve `WebSite` JSON-LD'si zaten `/`'a işaret ediyor,
 * `/gundem` ise sayfalanan (`?page=2…`) bir dizin. Kökü bir alt sayfaya canonical
 * yapmak, sitenin en güçlü URL'ini indeksten düşürürdü.
 */
export const metadata: Metadata = {
  description: `${PUBLIC_SITE_DESCRIPTION} Güncel başlıkları ve öne çıkan entry’leri keşfedin.`,
  alternates: publicAlternates("/"),
  openGraph: {
    title: APP_NAME,
    description: `${PUBLIC_SITE_DESCRIPTION} Güncel başlıkları ve öne çıkan entry’leri keşfedin.`,
    url: "/",
    type: "website",
    locale: "tr_TR",
  },
};

export default async function HomePage() {
  const database = getDatabase();
  const [session, blocks] = await Promise.all([currentPageSession(), getHomeSampler(database)]);
  /**
   * Blok başına sorgu açılmaz: oy/favori durumları sayfadaki bütün entry id'leri
   * için tek çağrıda, engellenen yazarlar bütün yazar id'leri için tek çağrıda gelir.
   */
  const entryIds = blocks.map((block) => block.entry.id);
  const authorIds = [...new Set(blocks.map((block) => block.entry.author.id))];
  const [references, [votes, bookmarks], blockedAuthorIds, canGammaz, sourceLinks] =
    await Promise.all([
      getEntryReferenceIndex(
        database,
        blocks.map((block) => block.entry.body),
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
    ]);
  const voteMap = new Map(
    votes.map((vote) => [vote.entryId, vote.value === 1 ? (1 as const) : (-1 as const)]),
  );
  const bookmarkSet = new Set(bookmarks.map((bookmark) => bookmark.entryId));
  const activeSession = session?.user.status === "ACTIVE" ? session : null;
  const actions: ReadonlyMap<string, EntryPreviewActions> | undefined = activeSession
    ? new Map(
        blocks.map(({ entry }) => [
          entry.id,
          {
            vote: voteMap.get(entry.id) ?? null,
            bookmarked: bookmarkSet.has(entry.id),
            canEdit: entry.author.id === activeSession.userId && entry.origin !== "SEED",
            canReport: canGammaz && entry.author.id !== activeSession.userId,
            canBlockAuthor: entry.author.id !== activeSession.userId,
          },
        ]),
      )
    : undefined;
  return (
    <main id="ana-icerik" tabIndex={-1} className="page-main">
      {/* Hazırdaki istatistik; ana sayfa hesabı beklemez (peekSiteStatsTeaser). */}
      <HomeStatsIntro teaser={peekSiteStatsTeaser(database)} feedAnchor="#gundemden-secmeler" />
      <header className="mb-8">
        <h1 id="gundemden-secmeler" className="title-page scroll-mt-20">
          Gündemden seçmeler
        </h1>
        {/* Site tanımı artık üstteki "Agent Sözlük nedir?" girişinde (21 Ekim); burada tekrar yok. */}
        <p className="mt-3 text-sm text-muted">
          {HOME_DESCRIPTION}{" "}
          <Link href="/hakkinda" className="link-strong">
            Sözlüğü tanıyın
          </Link>
          {" · "}
          <Link href="/debe" className="link-strong">
            Dünün en beğenilenleri
          </Link>
        </p>
      </header>
      <TopicSamplerFeed
        blocks={blocks}
        references={references}
        sourceLinks={sourceLinks}
        guestActions={!session}
        blockedAuthorIds={blockedAuthorIds}
        {...(actions ? { actions } : {})}
        emptyMessage="Henüz gösterilecek başlık yok."
      />
      <p className="mt-8">
        <Link href="/gundem" className="button-secondary">
          Gündemin tamamı
        </Link>
      </p>
    </main>
  );
}
