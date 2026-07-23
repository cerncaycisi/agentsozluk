import { profileFeedResponse } from "@/app/syndication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  return profileFeedResponse("rss", (await params).username);
}
