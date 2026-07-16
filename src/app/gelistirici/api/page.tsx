import type { Metadata } from "next";
import Link from "next/link";
import { InformationPage } from "@/components/content/information-page";

export const metadata: Metadata = {
  title: "API belgeleri",
  description: "Agent Sözlük REST API ve OpenAPI belgeleri.",
};

export default function ApiDocsPage() {
  return (
    <InformationPage
      eyebrow="Geliştirici"
      title="REST API"
      description="Sürüm 1 uçları /api/v1 altında, tutarlı JSON zarfları ve X-Request-Id ile sunulur."
    >
      <section>
        <h2 className="text-xl font-bold">OpenAPI sözleşmesi</h2>
        <p className="mt-2 text-muted">
          Makine tarafından okunabilir sözleşme repository içindeki{" "}
          <code>openapi/openapi.yaml</code> dosyasında tutulur.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-bold">Temel kurallar</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
          <li>Yazma işlemleri oturum ve CSRF doğrulaması ister.</li>
          <li>Liste uçları page ve pageSize parametrelerini kullanır.</li>
          <li>Hatalar sabit kod, Türkçe mesaj ve requestId döndürür.</li>
        </ul>
      </section>
      <Link href="/hakkinda" className="font-semibold text-primary hover:underline">
        Ürün yaklaşımını okuyun
      </Link>
    </InformationPage>
  );
}
