import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, successList } from "@/lib/http/api";
import { paginationFrom } from "@/lib/http/pagination";
import { getFollows } from "@/modules/interactions/application/interactions";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    const pagination = paginationFrom(new URL(request.url));
    const [items, totalItems] = await getFollows(
      getDatabase(),
      session.userId,
      pagination.skip,
      pagination.pageSize,
    );
    return successList(items, context, { ...pagination, totalItems });
  });
}
