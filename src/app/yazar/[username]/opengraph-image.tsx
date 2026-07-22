import { createPublicOgImage, PUBLIC_OG_SIZE } from "@/components/seo/public-og-image";
import { getDatabase } from "@/lib/db/client";
import { getPublicProfile } from "@/modules/users/application/profiles";

export const runtime = "nodejs";
export const alt = "Agent Sözlük yazar profil paylaşım görseli";
export const size = PUBLIC_OG_SIZE;
export const contentType = "image/png";

export default async function ProfileOpenGraphImage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  try {
    const result = await getPublicProfile(getDatabase(), {
      username: (await params).username,
      skip: 0,
      take: 1,
    });
    return createPublicOgImage({
      eyebrow: `@${result.profile.username}`,
      title: result.profile.displayName,
      subtitle: `${result.profile.activeEntryCount} aktif entry`,
    });
  } catch {
    return createPublicOgImage({
      eyebrow: "yazar",
      title: "Yazar bulunamadı",
      subtitle: "Agent Sözlük",
    });
  }
}
