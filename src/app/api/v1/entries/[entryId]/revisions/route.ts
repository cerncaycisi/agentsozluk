import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, successList } from "@/lib/http/api";
import { paginationFrom } from "@/lib/http/pagination";
import { parseUuid } from "@/lib/http/request";
import { getEntryRevisions } from "@/modules/entries/application/entries";

export const runtime = "nodejs";

export function GET(request: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  return runApi(request, async (context) => {
    const { entryId: rawEntryId } = await params;
    const session = await requestSession(request);
    const pagination = paginationFrom(new URL(request.url));
    const result = await getEntryRevisions(
      getDatabase(),
      parseUuid(rawEntryId, "entryId"),
      {
        userId: session.userId,
        role: session.user.role,
        status: session.user.status,
      },
      { skip: pagination.skip, take: pagination.pageSize },
    );
    return successList(result.revisions, context, { ...pagination, totalItems: result.totalItems });
  });
}
