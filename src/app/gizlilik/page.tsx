import type { Metadata } from "next";
import { CerezTercihiSifirla } from "@/components/analytics/cerez-tercihi-sifirla";
import { InformationPage } from "@/components/content/information-page";
import { APP_NAME } from "@/config/app";
import { publicAlternates } from "@/modules/indexing/domain/public-seo";

export const metadata: Metadata = {
  title: "Gizlilik",
  description: `${APP_NAME} gizlilik ve veri kullanımı özeti.`,
  alternates: publicAlternates("/gizlilik"),
};

export default function PrivacyPage() {
  return (
    <InformationPage
      eyebrow="Gizlilik"
      title="Veriniz üzerinde açık ve sınırlı kullanım"
      description="Hesap güvenliği ve sözlük işlevleri için gereken veriyi işleriz; ölçüm yalnız onayınızla yapılır, reklam hedefleme verisi satmayız."
    >
      <section>
        <h2 className="title-section">İşlenen veriler</h2>
        <p className="mt-2 text-muted">
          Hesap bilgileri, oturum güvenliği kayıtları, içerikleriniz ve gerçekleştirdiğiniz sözlük
          işlemleri hizmetin çalışması için saklanır. E-posta adresiniz herkese açık profilde
          gösterilmez.
        </p>
      </section>
      <section>
        <h2 className="title-section">Hesap kapatma</h2>
        <p className="mt-2 text-muted">
          Hesap kapatıldığında kimlik bilgileri anonimleştirilir; sözlük bütünlüğü için başlık ve
          entry içerikleri korunur.
        </p>
      </section>
      <section>
        <h2 className="title-section">Ölçüm ve çerezler</h2>
        <p className="mt-2 text-muted">
          Siteyi nasıl kullandığınızı anlamak için Google Tag Manager üzerinden Google Analytics 4
          kullanırız; yalnız siz çerez şeridinde “Kabul et” dediğinizde yüklenir. Kabul etmezseniz
          ölçüm etiketi hiç yüklenmez ve site aynen çalışır. Giriş yapılmış oturumlarda, moderasyon
          ve hesap yüzeylerinde, aramada ve tarayıcınız Do Not Track veya Global Privacy Control
          tercihi bildirdiğinde şerit gösterilmez, ölçüm yapılmaz.
        </p>
        <p className="mt-3 text-muted">
          Tercihiniz <code>as_cerez_onayi</code> adlı birinci taraf bir çerezde 180 gün saklanır.
          Oturum güvenliği için kullanılan çerezler zorunludur ve ölçüm için kullanılmaz. Ölçüme
          kullanıcı adı, hesap kimliği, e-posta, parola, oturum bilgisi veya yönetim ekranı içeriği
          gönderilmez; ölçüm verilerini reklam hedefleme için satmayız.
        </p>
        <CerezTercihiSifirla />
      </section>
    </InformationPage>
  );
}
