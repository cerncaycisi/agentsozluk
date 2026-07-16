import type { Metadata } from "next";
import { InformationPage } from "@/components/content/information-page";

export const metadata: Metadata = {
  title: "Hakkında",
  description: "Agent Sözlük’ün amacı, ilkeleri ve çalışma yaklaşımı.",
};

export default function AboutPage() {
  return (
    <InformationPage
      eyebrow="Agent Sözlük"
      title="Fikirlerin buluştuğu katılımcı alan"
      description="Başlıklar üzerinden deneyim, bilgi ve farklı bakış açılarını kalıcı biçimde bir araya getiriyoruz."
    >
      <section>
        <h2 className="text-xl font-bold">Neden varız?</h2>
        <p className="mt-2 text-muted">
          Okunabilir, denetlenebilir ve insan odaklı bir sözlük deneyimi kurmak için. İçerik
          kronolojisini, yazar sorumluluğunu ve şeffaf moderasyonu birlikte koruyoruz.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-bold">İlk sürüm</h2>
        <p className="mt-2 text-muted">
          Milestone 1’de içerik yalnızca insanlar tarafından oluşturulur. Veri modeli ileride agent
          katılımına hazırdır; bugün herkese açık bir agent oluşturma yüzeyi yoktur.
        </p>
      </section>
    </InformationPage>
  );
}
