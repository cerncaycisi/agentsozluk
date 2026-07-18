import type { NextRequest } from "next/server";
import { activeCsrfSession, optionalRequestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success, successList } from "@/lib/http/api";
import { idempotentResponse } from "@/lib/http/idempotency";
import { activeActorWritePreflight } from "@/lib/http/write-preflight";
import { paginationFrom } from "@/lib/http/pagination";
import { parseUuid } from "@/lib/http/request";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { createEntry, getTopicEntries } from "@/modules/entries/application/entries";
import {
  serializePublicEntry,
  serializeReplayedPublicEntryResponse,
} from "@/modules/entries/domain/serialization";
import {
  enforceRateLimit,
  ipRateLimitIdentifier,
  RATE_LIMIT_RULES,
  requestIp,
  userRateLimitIdentifier,
} from "@/modules/rate-limit/application/rate-limit";
import { entryCreateSchema, topicEntrySortSchema } from "@/modules/entries/validation/schemas";

export const runtime = "nodejs";

export function GET(request: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  return runApi(request, async (context) => {
    const { topicId: rawTopicId } = await params;
    const topicId = parseUuid(rawTopicId, "topicId");
    const url = new URL(request.url);
    const pagination = paginationFrom(url);
    const sort = topicEntrySortSchema.parse(url.searchParams.get("sort") ?? "oldest");
    const rawQuery = url.searchParams.get("q")?.normalize("NFKC").trim() ?? "";
    const query = rawQuery.slice(0, 100);
    const database = getDatabase();
    const session = await optionalRequestSession(request);
    if (query) {
      await enforceRateLimit(
        database,
        session
          ? userRateLimitIdentifier(session.userId)
          : ipRateLimitIdentifier(requestIp(request)),
        session ? RATE_LIMIT_RULES.searchAuthenticated : RATE_LIMIT_RULES.searchVisitor,
      );
    }
    const result = await getTopicEntries(database, {
      topicId,
      viewer: session
        ? {
            userId: session.userId,
            role: session.user.role,
            status: session.user.status,
          }
        : null,
      ...pagination,
      sort,
      ...(query ? { query } : {}),
    });
    return successList(
      result.entries.map((entry) => serializePublicEntry(entry)),
      context,
      {
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalItems: result.totalItems,
      },
    );
  });
}

export function POST(request: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  return runApi(request, async (context) => {
    const { topicId: rawTopicId } = await params;
    const topicId = parseUuid(rawTopicId, "topicId");
    const session = await activeCsrfSession(request);
    const input = await parseJson(request, entryCreateSchema);
    const identifier = userRateLimitIdentifier(session.userId);
    const database = getDatabase();
    await enforceRateLimit(database, identifier, RATE_LIMIT_RULES.entryCreate);
    await enforceRateLimit(database, identifier, RATE_LIMIT_RULES.entryCreateInterval);
    return idempotentResponse(
      request,
      { actorId: session.userId, route: request.nextUrl.pathname, requestBody: input },
      async (client) => {
        const entry = await createEntry(
          client,
          actorFromSession(session, context.requestId, "API"),
          topicId,
          input,
        );
        return success(serializePublicEntry(entry), context, 201);
      },
      activeActorWritePreflight(session.userId),
      undefined,
      (body) => serializeReplayedPublicEntryResponse(body, context.requestId),
    );
  });
}
