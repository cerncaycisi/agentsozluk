import type { Metadata } from "next";
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
          Google Tag Manager, Google Analytics 4 ve Hotjar yalnız giriş yapılmamış herkese açık
          sayfalardaki temel kullanım ve deneyim ölçümü için kullanılabilir. Giriş yapılmış
          oturumlarda, moderasyon ve hesap yüzeylerinde, aramada ve tarayıcınız Do Not Track veya
          Global Privacy Control tercihi bildirdiğinde bu ölçüm etiketleri yüklenmez.
        </p>
        <p className="mt-3 text-muted">
          Hotjar’a kullanıcı kimliği tanımlamayız; kullanıcı adı, hesap UUID’si, e-posta, parola,
          oturum token’ı veya yönetim ekranı içeriği gönderilmez. Ölçüm verilerini reklam hedefleme
          için satmayız.
        </p>
      </section>
    </InformationPage>
  );
}
