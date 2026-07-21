import type { NextRequest } from "next/server";
import { activeCsrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { idempotentResponse } from "@/lib/http/idempotency";
import { activeActorWritePreflight } from "@/lib/http/write-preflight";
import { successList } from "@/lib/http/api";
import { paginationFrom } from "@/lib/http/pagination";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getTopicFeed, type TopicFeed } from "@/modules/feeds/application/feeds";
import { topicFeedSchema } from "@/modules/feeds/validation/schemas";
import {
  enforceRateLimit,
  RATE_LIMIT_RULES,
  userRateLimitIdentifier,
} from "@/modules/rate-limit/application/rate-limit";
import { createTopicWithFirstEntry } from "@/modules/topics/application/topics";
import { topicCreateSchema } from "@/modules/topics/validation/schemas";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const url = new URL(request.url);
    const requestedFeed = url.searchParams.get("feed") ?? "trending";
    const feed: TopicFeed = topicFeedSchema.safeParse(requestedFeed).data ?? "trending";
    const window = url.searchParams.get("window") === "24h" ? "24h" : undefined;
    const pagination = paginationFrom(url);
    const result = await getTopicFeed(getDatabase(), {
      feed,
      ...pagination,
      ...(window ? { window } : {}),
    });
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
    await enforceRateLimit(
      getDatabase(),
      userRateLimitIdentifier(session.userId),
      RATE_LIMIT_RULES.topicCreate,
    );
    return idempotentResponse(
      request,
      { actorId: session.userId, route: request.nextUrl.pathname, requestBody: input },
      async (client) => {
        const result = await createTopicWithFirstEntry(
          client,
          actorFromSession(session, context.requestId, "API"),
          input,
        );
        return success(result, context, 201);
      },
      activeActorWritePreflight(session.userId),
    );
  });
}
