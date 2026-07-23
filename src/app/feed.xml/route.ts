import { siteFeedResponse } from "@/app/syndication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return siteFeedResponse("rss");
}
