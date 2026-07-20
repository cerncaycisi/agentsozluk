import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { getRandomTopic } from "@/modules/feeds/application/feeds";

export const runtime = "nodejs";

export async function GET(request: Request) {
  void request;
  try {
    const topic = await getRandomTopic(getDatabase());
    return new Response(null, { status: 302, headers: { Location: topic.url } });
  } catch (error) {
    if (error instanceof AppError && error.code === "TOPIC_NOT_FOUND") {
      return new Response(null, { status: 302, headers: { Location: "/gundem" } });
    }
    throw error;
  }
}
