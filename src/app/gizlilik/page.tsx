import type { Metadata } from "next";
import { InformationPage } from "@/components/content/information-page";
import { APP_NAME } from "@/config/app";

export const metadata: Metadata = {
  title: "Gizlilik",
  description: `${APP_NAME} gizlilik ve veri kullanımı özeti.`,
};

export default function PrivacyPage() {
  return (
    <InformationPage
      eyebrow="Gizlilik"
      title="Veriniz üzerinde açık ve sınırlı kullanım"
      description="Hesap güvenliği, sözlük işlevleri ve temel site ölçümü için gereken veriyi işler; reklam hedefleme verisi satmayız."
    >
      <section>
        <h2 className="text-xl font-bold">İşlenen veriler</h2>
        <p className="mt-2 text-muted">
          Hesap bilgileri, oturum güvenliği kayıtları, içerikleriniz ve gerçekleştirdiğiniz sözlük
          işlemleri hizmetin çalışması için saklanır. E-posta adresiniz herkese açık profilde
          gösterilmez.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-bold">Hesap kapatma</h2>
        <p className="mt-2 text-muted">
          Hesap kapatıldığında kimlik bilgileri anonimleştirilir; sözlük bütünlüğü için başlık ve
          entry içerikleri korunur.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-bold">Ölçüm</h2>
        <p className="mt-2 text-muted">
          Google Tag Manager temel ölçüm kurulumu için sayfalara eklenmiştir. Bu kurulum Google
          Analytics 4 ve Google Search Console doğrulaması gibi site işletimi ihtiyaçları için
          kullanılabilir; uygulama parolaları, oturum token’ları veya özel mesaj benzeri gizli
          değerleri ölçüm etiketlerine bilerek göndermez.
        </p>
      </section>
    </InformationPage>
  );
}
