import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { getRandomTopic } from "@/modules/feeds/application/feeds";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const topic = await getRandomTopic(getDatabase());
  return NextResponse.redirect(new URL(topic.url, request.url), 302);
}
