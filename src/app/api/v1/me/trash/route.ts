import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, successList } from "@/lib/http/api";
import { paginationFrom } from "@/lib/http/pagination";
import { listOwnEntryTrash } from "@/modules/moderation/application/trash-appeal";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    const pagination = paginationFrom(new URL(request.url));
    const result = await listOwnEntryTrash(getDatabase(), session.userId, {
      skip: pagination.skip,
      take: pagination.pageSize,
    });
    return successList(result.items, context, { ...pagination, totalItems: result.totalItems });
  });
}
