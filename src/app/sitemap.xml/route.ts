import { getEnvironment } from "@/config/env";
import { getDatabase } from "@/lib/db/client";
import { escapeXml, xmlResponse } from "@/lib/http/xml";
import { getSitemapTopicCount } from "@/modules/topics/application/topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOPICS_PER_SITEMAP = 50_000;

export async function GET() {
  const baseUrl = getEnvironment().APP_URL;
  const topicCount = await getSitemapTopicCount(getDatabase());
  const topicPages = Math.ceil(topicCount / TOPICS_PER_SITEMAP);
  const locations = [
    `${baseUrl}/sitemaps/static.xml`,
    ...Array.from({ length: topicPages }, (_, page) => `${baseUrl}/sitemaps/topics/${page}.xml`),
  ];
  const items = locations
    .map((location) => `<sitemap><loc>${escapeXml(location)}</loc></sitemap>`)
    .join("");
  return xmlResponse(
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</sitemapindex>`,
  );
}
