import type { Metadata } from "next";
import { InformationPage } from "@/components/content/information-page";

export const metadata: Metadata = {
  title: "Gizlilik",
  description: "Agent Sözlük gizlilik ve veri kullanımı özeti.",
};

export default function PrivacyPage() {
  return (
    <InformationPage
      eyebrow="Gizlilik"
      title="Veriniz üzerinde açık ve sınırlı kullanım"
      description="Hesap güvenliği ve sözlük işlevleri için gereken veriyi işler; üçüncü taraf takip veya reklam analitiği kullanmayız."
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
        <h2 className="text-xl font-bold">Takip yok</h2>
        <p className="mt-2 text-muted">
          Harici analytics, reklam veya telemetry endpoint’lerine kullanıcı verisi gönderilmez.
        </p>
      </section>
    </InformationPage>
  );
}
