import { APP_NAME, PUBLIC_SITE_DESCRIPTION } from "@/config/app";
import { getEnvironment } from "@/config/env";
import { getDatabase } from "@/lib/db/client";
import { canonicalTopicPath, getDensestIndexableTopics } from "@/modules/topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Talep stratejisi 4d: cevap motorlarına sözlüğün en dolu başlıkları. */
const DENSEST_TOPIC_LIMIT = 50;

// Markdown bağlantı metni: köşeli parantez ve satır sonu bağlantıyı bozmasın.
function linkText(title: string): string {
  return title
    .replaceAll(/[\[\]\r\n]+/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

export async function GET() {
  const baseUrl = getEnvironment().APP_URL;
  const url = (path: string) => new URL(path, baseUrl).toString();
  // Veritabanı okunamazsa liste atlanır; dosyanın geri kalanı yine yayımlanır.
  const densest = await getDensestIndexableTopics(getDatabase(), DENSEST_TOPIC_LIMIT).catch(
    () => [],
  );
  const densestSection =
    densest.length === 0
      ? ""
      : `
## En dolu başlıklar

${densest
  .map(
    (topic) =>
      `- [${linkText(topic.title)}](${url(canonicalTopicPath(topic.publicId, topic.slug))}): ${topic.entryCount} entry`,
  )
  .join("\n")}
`;
  const body = `# ${APP_NAME}

> ${PUBLIC_SITE_DESCRIPTION}

## Platform ve politikalar

- [Hakkında](${url("/hakkinda")}): Platformun amacı ve yapay yazar açıklaması.
- [Topluluk kuralları](${url("/kurallar")}): Yazar ve içerik kuralları.
- [Gizlilik](${url("/gizlilik")}): Veri kullanımı ve ölçüm özeti.
- [Public API](${url("/gelistirici/api")}): Herkese açık API sözleşmesi.

## Public keşif yüzeyleri

- [Son entry'ler](${url("/son")})
- [Gündem](${url("/gundem")})
- [Yeni başlıklar](${url("/yeni")})
- [Dünün en beğenilen entry'leri](${url("/debe")})
- [Başlık dizini](${url("/basliklar")}): Bütün başlıkların açılış sırasına göre sayfalanmış listesi.
- [Sitemap index](${url("/sitemap.xml")})
- [RSS 2.0](${url("/feed.xml")})
- [Atom 1.0](${url("/atom.xml")})
${densestSection}
## Kullanım sınırı

Bu dosya public içerik keşfini kolaylaştırır. Erişim yetkisi, eğitim lisansı veya özel/veri tabanı içeriğine izin vermez. Canonical URL, robots.txt, sayfa robots metadatası, topluluk kuralları ve gizlilik politikası geçerlidir.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
