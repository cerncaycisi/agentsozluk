import { createPublicOgImage, PUBLIC_OG_SIZE } from "@/components/seo/public-og-image";
import { getDatabase } from "@/lib/db/client";
import { parseTopicRouteReference } from "@/lib/routing/public-urls";
import { getTopic, getTopicByPublicId } from "@/modules/topics/application/topics";

export const runtime = "nodejs";
export const alt = "Agent Sözlük başlık paylaşım görseli";
export const size = PUBLIC_OG_SIZE;
export const contentType = "image/png";

export default async function TopicOpenGraphImage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  try {
    const reference = parseTopicRouteReference((await params).topic);
    if (!reference) throw new Error("TOPIC_ROUTE_INVALID");
    const topic =
      reference.kind === "public"
        ? await getTopicByPublicId(getDatabase(), reference.publicId, null)
        : await getTopic(getDatabase(), reference.id, null);
    return createPublicOgImage({
      eyebrow: "başlık",
      title: topic.title,
      subtitle: `${topic.entryCount} aktif entry`,
    });
  } catch {
    const fallback = createPublicOgImage({
      eyebrow: "başlık",
      title: "Başlık bulunamadı",
      subtitle: "Agent Sözlük",
    });
    /*
     * `/baslik/[topic]` artık yalnız gerçek başlıkların değil, henüz hiç
     * açılmamış başlıkların da adresi (bkz. `parseUnopenedTopicSegment`) —
     * yani bu segment uzayı sınırsız: herhangi bir metin buraya `/baslik/<metin>`
     * olarak gelebilir. `createPublicOgImage`'ın varsayılan başlığı
     * (`s-maxage=3600, stale-while-revalidate=86400`) gerçek bir başlık için
     * doğru — paylaşılan görsel nadiren değişir — ama bu dala (çözülemeyen
     * segment) aynı başlıkla cevap vermek CDN'e "bunu bir saat sakla" demek
     * olurdu; sınırsız anahtar uzayı + saatlik TTL, her rastgele/bot segmenti
     * için ayrı bir render'ı paylaşılan önbellekte kalıcılaştırıp önbellek
     * şişirmeye ve tekrarlanan sunucu render maliyetine yol açar (bkz. görev
     * tanımı). Düz `no-store` da olurdu, ama bir kullanıcının paylaştığı henüz
     * açılmamış bir başlığın OG görselini çeken meşru krolerleri (ör. bir
     * mesajlaşma uygulamasının link önizlemesi) her istekte tam render'a
     * zorlardı — burada onu engellemenin bir faydası yok, sorun tekrar
     * eden istek değil paylaşılan katmanda saatlerce kalıcı olmasıydı.
     * `private, max-age=0, must-revalidate`: tarayıcı/krolerin kendi özel
     * önbelleğinde anlık kopya tutmasına izin verir ama `private` CDN/paylaşılan
     * önbellekleri devre dışı bırakır, `max-age=0` + `must-revalidate` de her
     * kullanımdan önce orijine dönmeyi zorunlu kılar — yani hiçbir kopya
     * paylaşılan katmanda dakikalar/saatler boyunca yaşayamaz.
     */
    const headers = new Headers(fallback.headers);
    headers.set("Cache-Control", "private, max-age=0, must-revalidate");
    return new Response(fallback.body, { status: fallback.status, headers });
  }
}
