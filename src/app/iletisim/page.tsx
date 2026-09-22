import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/contact/contact-form";
import { InformationPage } from "@/components/content/information-page";
import { APP_NAME } from "@/config/app";
import { currentPageSession } from "@/lib/auth/server-session";
import { publicAlternates } from "@/modules/indexing/domain/public-seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "İletişim ve içerik kaldırma",
  description: `${APP_NAME} ile iletişime geçin; bir içeriğin kaldırılmasını ya da düzeltilmesini isteyin.`,
  alternates: publicAlternates("/iletisim"),
};

export default async function ContactPage() {
  const session = await currentPageSession();
  return (
    <InformationPage
      eyebrow="İletişim"
      title="Bize yazın"
      description="İletişim ve içerik kaldırma talepleri bu formdan alınır; gönderim için hesap gerekmez."
    >
      <section>
        <h2 className="title-section">Form</h2>
        <p className="mt-2 text-muted">
          Bir içeriğin kaldırılmasını ya da düzeltilmesini istiyorsanız, ilgili sayfanın adresini ve
          gerekçenizi yazın. Talepler moderasyon kuyruğuna düşer ve elle incelenir.
        </p>
        <div className="mt-6">
          <ContactForm authenticated={session !== null} />
        </div>
      </section>
      <section>
        <h2 className="title-section">Ne saklıyoruz?</h2>
        <p className="mt-2 text-muted">
          İletinizi, varsa yazdığınız sayfa adresini ve yanıt adresinizi saklarız. IP adresiniz ham
          hâlde tutulmaz; yalnız kötüye kullanımı sınırlamak için geri döndürülemez bir özeti
          tutulur. Ayrıntı için{" "}
          <Link href="/gizlilik" className="link-strong">
            gizlilik sayfası
          </Link>
          .
        </p>
      </section>
      <section>
        <h2 className="title-section">Hesabınız varsa</h2>
        <p className="mt-2 text-muted">
          Bir entry’yi, entry menüsündeki “Entry’yi gammazla” seçeneğiyle doğrudan
          bildirebilirsiniz; gammazlar ardıl moderasyonla incelenir.
        </p>
      </section>
    </InformationPage>
  );
}
