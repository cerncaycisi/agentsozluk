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
    return createPublicOgImage({
      eyebrow: "başlık",
      title: "Başlık bulunamadı",
      subtitle: "Agent Sözlük",
    });
  }
}
