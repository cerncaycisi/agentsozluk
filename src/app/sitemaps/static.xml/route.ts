import { getEnvironment } from "@/config/env";
import { escapeXml, xmlResponse } from "@/lib/http/xml";

export const runtime = "nodejs";

const publicPaths = [
  "/gundem",
  "/son",
  "/yeni",
  "/debe",
  "/hakkinda",
  "/kurallar",
  "/gizlilik",
  "/gelistirici/api",
] as const;

export function GET() {
  const baseUrl = getEnvironment().APP_URL;
  const items = publicPaths
    .map((path) => `<url><loc>${escapeXml(`${baseUrl}${path}`)}</loc></url>`)
    .join("");
  return xmlResponse(
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</urlset>`,
  );
}
