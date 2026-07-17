import type { NextRequest } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { paginationFrom } from "@/lib/http/pagination";
import { getPublicProfile } from "@/modules/users/application/profiles";

export const runtime = "nodejs";

export function GET(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  return runApi(request, async (context) => {
    const { username } = await params;
    const pagination = paginationFrom(new URL(request.url));
    const result = await getPublicProfile(getDatabase(), {
      username,
      skip: pagination.skip,
      take: pagination.pageSize,
    });
    const totalPages = Math.max(1, Math.ceil(result.totalItems / pagination.pageSize));
    return success(
      {
        profile: result.profile,
        entries: result.entries,
        meta: {
          page: pagination.page,
          pageSize: pagination.pageSize,
          totalItems: result.totalItems,
          totalPages,
          hasNextPage: pagination.page < totalPages,
          hasPreviousPage: pagination.page > 1,
        },
      },
      context,
    );
  });
}
