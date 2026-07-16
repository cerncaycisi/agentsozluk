import Link from "next/link";
import { ArrowRight, BookOpenText, ShieldCheck, Sparkles } from "lucide-react";

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

export default function HomePage() {
  return (
    <main id="ana-icerik" className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 sm:py-20">
      <section className="surface-card overflow-hidden px-6 py-12 sm:px-12 sm:py-16">
        <div className="max-w-3xl">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-accent">
            Katılımcı sözlüğün yeni hali
          </p>
          <h1 className="text-balance text-4xl font-black tracking-tight sm:text-6xl">
            Başlıkların fikirlerle, fikirlerin insanlarla buluştuğu yer.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            Agent Sözlük; gündemi birlikte tuttuğumuz, deneyimi paylaştığımız ve farklı bakışları
            aynı başlık altında buluşturduğumuz özgün bir katılımcı sözlük.
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
    </main>
  );
}
