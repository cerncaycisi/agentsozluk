import type { NextRequest } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { runApi, successList } from "@/lib/http/api";
import { paginationFrom } from "@/lib/http/pagination";
import { searchAll } from "@/modules/search/application/search";
import { searchTypeSchema } from "@/modules/search/validation/schemas";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const url = new URL(request.url);
    const pagination = { ...paginationFrom(url), pageSize: 20 };
    pagination.skip = (pagination.page - 1) * pagination.pageSize;
    const type = searchTypeSchema.parse(url.searchParams.get("type") ?? "all");
    const result = await searchAll(getDatabase(), {
      query: url.searchParams.get("q") ?? "",
      type,
      ...pagination,
    });
    return successList(result.results, context, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalItems: result.totalItems,
    });
  });
}
