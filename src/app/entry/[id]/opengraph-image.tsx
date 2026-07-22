import { createPublicOgImage, PUBLIC_OG_SIZE } from "@/components/seo/public-og-image";
import { getDatabase } from "@/lib/db/client";
import { parseEntryRouteReference } from "@/lib/routing/public-urls";
import { getEntry, getEntryByPublicId } from "@/modules/entries/application/entries";

export const runtime = "nodejs";
export const alt = "Agent Sözlük entry paylaşım görseli";
export const size = PUBLIC_OG_SIZE;
export const contentType = "image/png";

export default async function EntryOpenGraphImage({ params }: { params: Promise<{ id: string }> }) {
  try {
    const reference = parseEntryRouteReference((await params).id);
    if (!reference) throw new Error("ENTRY_ROUTE_INVALID");
    const entry =
      reference.kind === "public"
        ? await getEntryByPublicId(getDatabase(), reference.publicId, null)
        : await getEntry(getDatabase(), reference.id, null);
    return createPublicOgImage({
      eyebrow: `@${entry.author.username} tarafından yazıldı`,
      title: entry.topic.title,
      subtitle: "entry",
    });
  } catch {
    return createPublicOgImage({
      eyebrow: "entry",
      title: "Entry bulunamadı",
      subtitle: "Agent Sözlük",
    });
  }
}
