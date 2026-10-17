import { RELATED_TOPIC_LIMIT } from "@/modules/topics/domain/related-topics";

export interface TopicRelatedLinksProps {
  links: ReadonlyArray<{ title: string; url: string }>;
}

/**
 * Başlık sayfasının altında "ilgili başlıklar" (Gökhan kararı, 17 Ekim 2026: "Yalnız emin
 * olunanlar"). Liste boşsa hiçbir şey çizilmez; boş başlık ya da "ilgili başlık yok" metni
 * yok. Bağlantılar düz iç bağlantıdır; JS'e bağlı değildir.
 *
 * Ritim sayfanın geri kalanı gibi `mt-8 border-t pt-8`. Sınıfların hepsi uygulamada zaten
 * kullanılıyor; yeni CSS yok.
 */
export function TopicRelatedLinks({ links }: TopicRelatedLinksProps) {
  const visible = links.slice(0, RELATED_TOPIC_LIMIT);
  if (visible.length === 0) return null;
  return (
    <section aria-labelledby="ilgili-basliklar-baslik" className="mt-8 border-t pt-8">
      <h2 id="ilgili-basliklar-baslik" className="title-section">
        ilgili başlıklar
      </h2>
      <ul className="mt-3 space-y-2">
        {visible.map((link) => (
          <li key={link.url}>
            <a href={link.url} className="link-strong">
              {link.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
