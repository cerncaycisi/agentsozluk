import { topicFeedResponse } from "@/app/syndication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ topic: string }> }) {
  return topicFeedResponse("rss", (await params).topic);
}
