import Link from "next/link";
import { ArrowRight, BookOpenText, ShieldCheck, Sparkles } from "lucide-react";
import { randomTopicAction } from "@/app/actions/topics";
import { APP_NAME } from "@/config/app";
import { EntryPreview } from "@/components/entries/entry-preview";
import { TopicList } from "@/components/topics/topic-list";
import { getDatabase } from "@/lib/db/client";
import { getDebe, getTopicFeed } from "@/modules/feeds/application/feeds";

export const dynamic = "force-dynamic";

const principles = [
  {
    icon: BookOpenText,
    title: "İçerik odaklı",
    description:
      "Başlıklar ve entry’ler hızlı okunur; fikirler gereksiz arayüz gürültüsünde kaybolmaz.",
  },
  {
    icon: ShieldCheck,
    title: "Güvenli ve şeffaf",
    description:
      "Raporlama, denetlenebilir moderasyon ve açık topluluk kuralları birlikte çalışır.",
  },
  {
    icon: Sparkles,
    title: "İnsanlarla başlar",
    description:
      "İlk sürüm gerçek katılımcılar için kuruludur; gelecekteki agent katılımına hazırdır.",
  },
];

export default async function HomePage() {
  const database = getDatabase();
  const [popular, recent, newest, debe] = await Promise.all([
    getTopicFeed(database, { feed: "popular", page: 1, pageSize: 5, skip: 0 }),
    getTopicFeed(database, { feed: "recent", page: 1, pageSize: 5, skip: 0 }),
    getTopicFeed(database, { feed: "new", page: 1, pageSize: 5, skip: 0 }),
    getDebe(database),
  ]);
  return (
    <main id="ana-icerik" className="mx-auto max-w-[820px] px-4 py-12 sm:px-6 sm:py-16">
      <section className="surface-card overflow-hidden px-6 py-12 sm:px-12 sm:py-16">
        <div className="max-w-3xl">
          <p className="text-accent-contrast mb-4 text-sm font-bold uppercase tracking-[0.18em]">
            Katılımcı sözlüğün yeni hali
          </p>
          <h1 className="text-balance text-4xl font-black tracking-tight sm:text-6xl">
            Başlıkların fikirlerle, fikirlerin insanlarla buluştuğu yer.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            {APP_NAME}; gündemi birlikte tuttuğumuz, deneyimi paylaştığımız ve farklı bakışları aynı
            başlık altında buluşturduğumuz özgün bir katılımcı sözlük.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/kayit" className="button-primary gap-2">
              Aramıza katıl <ArrowRight aria-hidden="true" size={18} />
            </Link>
            <Link href="/gundem" className="button-secondary">
              Gündeme göz at
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="ilkeler" className="py-14">
        <h2 id="ilkeler" className="text-2xl font-black tracking-tight">
          Sözün değerini koruyan bir alan
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {principles.map(({ icon: Icon, title, description }) => (
            <article key={title} className="surface-card p-6">
              <Icon aria-hidden="true" className="text-primary" />
              <h3 className="mt-5 text-lg font-bold">{title}</h3>
              <p className="mt-2 leading-7 text-muted">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-8">
        <section aria-labelledby="bugunun-populerleri">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id="bugunun-populerleri" className="text-2xl font-black">
              Bugünün popülerleri
            </h2>
            <Link href="/gundem" className="text-sm font-semibold text-primary hover:underline">
              Tüm gündem
            </Link>
          </div>
          <TopicList topics={popular.topics} emptyMessage="Bugün henüz hareketli başlık yok." />
        </section>
        <section aria-labelledby="son-entry-basliklari">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id="son-entry-basliklari" className="text-2xl font-black">
              Son entry girilenler
            </h2>
            <Link href="/son" className="text-sm font-semibold text-primary hover:underline">
              Tümünü gör
            </Link>
          </div>
          <TopicList topics={recent.topics} emptyMessage="Henüz entry girilmiş başlık yok." />
        </section>
        <section aria-labelledby="yeni-basliklar">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id="yeni-basliklar" className="text-2xl font-black">
              Yeni başlıklar
            </h2>
            <Link href="/yeni" className="text-sm font-semibold text-primary hover:underline">
              Tümünü gör
            </Link>
          </div>
          <TopicList topics={newest.topics} emptyMessage="Henüz yeni başlık yok." />
        </section>
        <section aria-labelledby="debe-onizleme">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id="debe-onizleme" className="text-2xl font-black">
              DEBE’den
            </h2>
            <Link href="/debe" className="text-sm font-semibold text-primary hover:underline">
              Dünün en iyileri
            </Link>
          </div>
          <div className="space-y-4">
            {debe.slice(0, 3).map((entry) => (
              <EntryPreview key={entry.id} entry={entry} />
            ))}
            {debe.length === 0 ? (
              <p className="surface-card p-6 text-muted">Dünden pozitif puanlı entry yok.</p>
            ) : null}
          </div>
        </section>
        <section
          aria-labelledby="rastgele-baslik"
          className="surface-card flex flex-wrap items-center justify-between gap-5 p-6"
        >
          <div>
            <h2 id="rastgele-baslik" className="text-xl font-black">
              Başka bir başlığa uğra
            </h2>
            <p className="mt-2 text-muted">Sözlükte aktif bir başlığı rastgele keşfedin.</p>
          </div>
          <form action={randomTopicAction}>
            <button type="submit" className="button-secondary">
              Rastgele başlık
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
