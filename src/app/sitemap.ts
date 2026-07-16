import type { MetadataRoute } from "next";
import { getDatabase } from "@/lib/db/client";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const staticPaths = [
    "",
    "/gundem",
    "/son",
    "/yeni",
    "/debe",
    "/ara",
    "/hakkinda",
    "/kurallar",
    "/gizlilik",
    "/gelistirici/api",
  ];
  const topics = await getDatabase().topic.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return [
    ...staticPaths.map((path) => ({
      url: `${baseUrl}${path}`,
      changeFrequency: path === "" ? ("daily" as const) : ("weekly" as const),
      priority: path === "" ? 1 : 0.7,
    })),
    ...topics.map((topic) => ({
      url: `${baseUrl}/baslik/${topic.id}-${topic.slug}`,
      lastModified: topic.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
