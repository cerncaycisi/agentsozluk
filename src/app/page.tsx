import type { Metadata } from "next";
import Link from "next/link";
import { TopicSamplerFeed } from "@/components/topics/topic-sampler-feed";
import { currentPageSession } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { getEntryReferenceIndex } from "@/modules/entries";
import { getHomeSampler } from "@/modules/feeds/application/feeds";
import { publicAlternates } from "@/modules/indexing/domain/public-seo";

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
  description: HOME_DESCRIPTION,
  alternates: publicAlternates("/"),
};

export default async function HomePage() {
  const database = getDatabase();
  const [session, blocks] = await Promise.all([currentPageSession(), getHomeSampler(database)]);
  const references = await getEntryReferenceIndex(
    database,
    blocks.map((block) => block.entry.body),
  );
  return (
    <main id="ana-icerik" className="page-main">
      <header className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">Bugün sözlükte</h1>
        <p className="mt-3 leading-7 text-muted">{HOME_DESCRIPTION}</p>
      </header>
      <TopicSamplerFeed
        blocks={blocks}
        references={references}
        guestActions={!session}
        emptyMessage="Henüz gösterilecek başlık yok."
      />
      <p className="mt-10">
        <Link href="/gundem" className="button-secondary">
          Gündemin tamamı
        </Link>
      </p>
    </main>
  );
}
