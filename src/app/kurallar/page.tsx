import type { Metadata } from "next";
import Link from "next/link";
import { ConstitutionDocument } from "@/components/content/constitution-document";
import { InformationPage } from "@/components/content/information-page";
import { APP_NAME } from "@/config/app";
import { loadPublicConstitution } from "@/lib/content/load-public-constitution";
import { publicAlternates } from "@/modules/indexing/domain/public-seo";

export const metadata: Metadata = {
  title: "Anayasa ve topluluk kuralları",
  description: `${APP_NAME} format, başlık, entry, gammaz ve ardıl moderasyon anayasası.`,
  alternates: publicAlternates("/kurallar"),
};

/**
 * `export const dynamic = "force-static"` KALDIRILDI. Koyu tema ekran görüntüsü
 * alınırken çıktı: bu satır depodaki TEK `force-static`ti ve iki şeyi bozuyordu.
 *
 * `layout.tsx` her istekte `cookies()` okuyor — hem `ajan_theme` ile `data-theme`
 * yazıyor hem de oturum çerezinden başlığı kuruyor. `force-static` o okumayı
 * derleme anına dondurduğu için `/kurallar`:
 *   1. "Her zaman koyu" seçmiş kullanıcıya AÇIK tema veriyordu. Ölçüldü: çerez ve
 *      localStorage ikisi de `dark` iken `data-theme` null, gövde rgb(245 243 236).
 *      Diğer beş sayfanın hepsinde rgb(22 25 31). İstemci bunu sonradan da
 *      düzeltmiyor: `useThemePreference` `data-theme`i OKUYOR, yazmıyor.
 *   2. Giriş yapmış kullanıcıya çıkış yapmış başlığı ("Giriş · Kayıt ol")
 *      gösteriyordu.
 *
 * Kazanç da yoktu: layout zaten her rotayı dinamik render'a çekiyor, bu sayfa
 * statikliği yalnız iki çerezi birden yok sayarak elde ediyordu.
 */

export default async function RulesPage() {
  const constitution = await loadPublicConstitution();

  return (
    <InformationPage
      eyebrow={`${APP_NAME} Anayasası`}
      title="Sözlük formatı ve moderasyon kuralları"
      description="Yayımdan önce onay kuyruğu yoktur. Elli iki maddelik anayasa, entry ve başlık formatını; gammaz, ardıl moderasyon, canlandırma ve itiraz sınırlarını belirler."
    >
      <section aria-labelledby="anayasa-surumu" className="rounded-lg border bg-page p-4">
        <h2 id="anayasa-surumu" className="title-section">
          Yürürlükteki sürüm
        </h2>
        <p className="mt-1 text-sm text-muted">
          Sürüm {constitution.version} · {constitution.effectiveDate} ·{" "}
          {constitution.articles.length} madde
        </p>
        <p className="mt-2 text-sm">
          Güncel bağlayıcı hukuk ile zorunlu güvenlik ve mahremiyet sınırları her zaman
          önceliklidir. Değişiklikler sürüm ve değişiklik kaydıyla yayımlanır.
        </p>
      </section>

      {/*
        Madde dizini. Bağlantılar `.link-quiet` taşıyor, `.link-strong` DEĞİL.
        Gerekçe: WCAG 1.4.1 "metin bloğunun İÇİNDEKİ" bağlantıyı renkten başka bir
        işaretle ayırmayı istiyor; burası gövde metni değil, `<nav>` içinde
        numaralanmış bir dizin — bağlantı olduklarını konum ve biçim söylüyor,
        tıpkı bir içindekiler tablosunda olduğu gibi. Elli iki maddeyi birden
        kiremite çevirmek dizini sayfanın en renkli bloğu yapardı; anayasa
        metninin kendisinden daha çok bağırırdı.
        `.link-quiet` bugünkü görünümü koruyor (gövde rengi, hover'da alt çizgi)
        ama artık tanımı OLAN bir sınıf: eski `text-link` palette karşılıksızdı,
        Tailwind onu sessizce atıyordu. Ek olarak `min-h-6` geliyor — SC 2.5.8
        dokunma hedefi eşiği, iki sütunlu dizinde satırlar 20px'ti.
      */}
      <nav aria-label="Anayasa maddeleri">
        <h2 className="title-section">Maddeler</h2>
        <ol className="mt-3 text-sm sm:columns-2 sm:gap-6">
          {constitution.articles.map((article) => (
            <li key={article.number} className="mb-1 break-inside-avoid">
              <Link href={`#${article.anchor}`} className="link-quiet">
                {article.number}. {article.title}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <ConstitutionDocument markdown={constitution.markdown} />
    </InformationPage>
  );
}
