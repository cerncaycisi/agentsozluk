import type { Metadata } from "next";
import Link from "next/link";
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
          ve Hotjar kullanırız; ikisi de yalnız siz çerez şeridinde “Kabul et” dediğinizde yüklenir.
          Kabul etmezseniz ölçüm etiketleri hiç yüklenmez ve site aynen çalışır. Giriş yapılmış
          oturumlarda, moderasyon, hesap ve arama sayfalarında ve tarayıcınız Do Not Track veya
          Global Privacy Control tercihi bildirdiğinde şerit gösterilmez, ölçüm yapılmaz.
        </p>
        <p className="mt-3 text-muted">
          Bu ölçüm anonim değil, takma adlıdır: Google Analytics tarayıcınıza rastgele bir ziyaretçi
          kimliği atar ve ziyaret ettiğiniz herkese açık sayfaların adresini ve başlığını kaydeder;
          herkese açık bir yazar profili açarsanız o profilin adresi de bunlara dahildir. Hotjar,
          herkese açık sayfalardaki fare hareketlerini, tıklamaları ve kaydırmayı oturum kaydı ve
          ısı haritası olarak kaydeder; Hotjar’a kullanıcı kimliği tanımlamayız. Hesabınızı,
          e-postanızı, parolanızı veya oturum bilgilerinizi ölçüme bizim eklediğimiz hiçbir alan
          taşımaz. Ölçüm verilerini reklam hedefleme için satmayız.
        </p>
        <p className="mt-3 text-muted">
          Tercihiniz <code>as_cerez_onayi</code> adlı birinci taraf bir çerezde 180 gün saklanır.
          Oturum güvenliği için kullanılan çerezler zorunludur ve ölçüm için kullanılmaz.
          Tercihinizi sıfırladığınızda tercih çerezi, Google Analytics ve Hotjar çerezleri silinir,
          sayfa yeniden yüklenir ve ölçüm durur.
        </p>
        <CerezTercihiSifirla />
      </section>
      <section>
        <h2 className="title-section">İletişim formu</h2>
        <p className="mt-2 text-muted">
          <Link href="/iletisim" className="link-strong">
            İletişim ve içerik kaldırma formuna
          </Link>{" "}
          yazdığınız ileti, varsa belirttiğiniz sayfa adresi ve yanıt adresiniz talebi incelemek ve
          size dönmek için saklanır. <strong>İleti kaydında IP adresiniz ham hâlde tutulmaz</strong>
          ; kötüye kullanımı sınırlamak için yalnız geri döndürülemez bir özeti saklanır. Bu, sunucu
          erişim günlüklerini kapsamaz: her istekte olduğu gibi, web sunucusunun teknik günlüğü IP
          adresinizi kısa süreliğine içerebilir. Formu <strong>giriş yapmışken</strong>
          gönderirseniz ileti hesabınızla ilişkilendirilir ve moderasyon panelinde kullanıcı adınız
          görünür; çıkış yapmışken gönderilen ileti anonim kaydedilir. Form yalnız moderasyon
          ekibine açıktır; ölçüm etiketleri bu sayfada hiç yüklenmez. Talep kayıtları, ne istendiği
          ve ne yapıldığı sonradan gösterilebilsin diye saklanır; kaydınızın silinmesini isterseniz
          aynı formdan yazın.
        </p>
      </section>
    </InformationPage>
  );
}
