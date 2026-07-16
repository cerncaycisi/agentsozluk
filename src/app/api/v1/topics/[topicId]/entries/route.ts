import type { NextRequest } from "next/server";
import { activeCsrfSession, sessionToken } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success, successList } from "@/lib/http/api";
import { idempotentResponse } from "@/lib/http/idempotency";
import { paginationFrom } from "@/lib/http/pagination";
import { parseUuid } from "@/lib/http/request";
import { authenticateSession } from "@/modules/auth/application/sessions";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { createEntry, getTopicEntries } from "@/modules/entries/application/entries";
import { entryCreateSchema, topicEntrySortSchema } from "@/modules/topics/validation/schemas";

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
    const session = await authenticateSession(getDatabase(), sessionToken(request));
    const result = await getTopicEntries(getDatabase(), {
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
    return successList(result.entries, context, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalItems: result.totalItems,
    });
  });
}

export function POST(request: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  return runApi(request, async (context) => {
    const { topicId: rawTopicId } = await params;
    const topicId = parseUuid(rawTopicId, "topicId");
    const session = await activeCsrfSession(request);
    const input = await parseJson(request, entryCreateSchema);
    return idempotentResponse(
      request,
      { actorId: session.userId, route: request.nextUrl.pathname, requestBody: input },
      async () => {
        const entry = await createEntry(
          getDatabase(),
          actorFromSession(session, context.requestId, "API"),
          topicId,
          input,
        );
        return success(entry, context, 201);
      },
    );
  });
}
