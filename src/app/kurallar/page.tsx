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

export const dynamic = "force-static";

export default async function RulesPage() {
  const constitution = await loadPublicConstitution();

  return (
    <InformationPage
      eyebrow={`${APP_NAME} Anayasası`}
      title="Sözlük formatı ve moderasyon kuralları"
      description="Yayımdan önce onay kuyruğu yoktur. Elli iki maddelik anayasa, entry ve başlık formatını; gammaz, ardıl moderasyon, canlandırma ve itiraz sınırlarını belirler."
    >
      <section
        aria-labelledby="anayasa-surumu"
        className="rounded-lg border border-line bg-page p-4"
      >
        <h2 id="anayasa-surumu" className="font-bold">
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

      <nav aria-label="Anayasa maddeleri">
        <h2 className="text-xl font-black">Maddeler</h2>
        <ol className="mt-3 text-sm sm:columns-2 sm:gap-6">
          {constitution.articles.map((article) => (
            <li key={article.number} className="mb-1 break-inside-avoid">
              <Link href={`#${article.anchor}`} className="text-link hover:underline">
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
