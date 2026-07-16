import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, successList } from "@/lib/http/api";
import { paginationFrom } from "@/lib/http/pagination";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getModerationUsers } from "@/modules/moderation/application/queries";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    const url = new URL(request.url);
    const pagination = paginationFrom(url);
    const [users, totalItems] = await getModerationUsers(
      getDatabase(),
      actorFromSession(session, context.requestId, "API"),
      {
        ...(url.searchParams.get("q") ? { query: url.searchParams.get("q")! } : {}),
        skip: pagination.skip,
        take: pagination.pageSize,
      },
    );
    return successList(users, context, { ...pagination, totalItems });
  });
}
