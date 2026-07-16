import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/config/app";

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
}

export function paginationFrom(url: URL): Pagination {
  const rawPage = Number(url.searchParams.get("page") ?? 1);
  const rawPageSize = Number(url.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE);
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const pageSize =
    Number.isInteger(rawPageSize) && rawPageSize >= 1
      ? Math.min(rawPageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  return { page, pageSize, skip: (page - 1) * pageSize };
}
