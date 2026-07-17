import { getEnvironment } from "@/config/env";
import { getDatabase } from "@/lib/db/client";
import { MAX_SKIP } from "@/lib/http/pagination";
import { escapeXml, xmlResponse } from "@/lib/http/xml";
import { getSitemapTopics } from "@/modules/topics/application/topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOPICS_PER_SITEMAP = 50_000;

export async function GET(_request: Request, { params }: { params: Promise<{ page: string }> }) {
  const rawPage = (await params).page;
  const match = /^(0|[1-9]\d*)\.xml$/u.exec(rawPage);
  if (!match) return xmlResponse("<error>Bulunamadı</error>", 404);
  const page = Number(match[1]);
  if (!Number.isSafeInteger(page) || page * TOPICS_PER_SITEMAP > MAX_SKIP)
    return xmlResponse("<error>Bulunamadı</error>", 404);
  const topics = await getSitemapTopics(getDatabase(), {
    page,
    pageSize: TOPICS_PER_SITEMAP,
  });
  if (topics.length === 0 && page > 0) return xmlResponse("<error>Bulunamadı</error>", 404);
  const baseUrl = getEnvironment().APP_URL;
  const items = topics
    .map(
      (topic) =>
        `<url><loc>${escapeXml(`${baseUrl}/baslik/${topic.id}-${topic.slug}`)}</loc>` +
        `<lastmod>${topic.updatedAt.toISOString()}</lastmod></url>`,
    )
    .join("");
  return xmlResponse(
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</urlset>`,
  );
}
