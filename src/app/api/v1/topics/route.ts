import type { NextRequest } from "next/server";
import { activeCsrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { idempotentResponse } from "@/lib/http/idempotency";
import { successList } from "@/lib/http/api";
import { paginationFrom } from "@/lib/http/pagination";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getTopicFeed, type TopicFeed } from "@/modules/feeds/application/feeds";
import { createTopicWithFirstEntry } from "@/modules/topics/application/topics";
import { topicCreateSchema } from "@/modules/topics/validation/schemas";

export const runtime = "nodejs";

const topicFeeds = new Set<TopicFeed>(["trending", "recent", "new", "popular"]);

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const url = new URL(request.url);
    const requestedFeed = url.searchParams.get("feed") ?? "trending";
    const feed = topicFeeds.has(requestedFeed as TopicFeed)
      ? (requestedFeed as TopicFeed)
      : "trending";
    const pagination = paginationFrom(url);
    const result = await getTopicFeed(getDatabase(), { feed, ...pagination });
    return successList(result.topics, context, {
      page: pagination.page,
      pageSize: Math.min(pagination.pageSize, 30),
      totalItems: result.totalItems,
    });
  });
}

export function POST(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await activeCsrfSession(request);
    const input = await parseJson(request, topicCreateSchema);
    return idempotentResponse(
      request,
      { actorId: session.userId, route: request.nextUrl.pathname, requestBody: input },
      async () => {
        const result = await createTopicWithFirstEntry(
          getDatabase(),
          actorFromSession(session, context.requestId, "API"),
          input,
        );
        return success(result, context, 201);
      },
    );
  });
}
