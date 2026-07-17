import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/config/app";

export const MAX_PAGE = 10_000;
export const MAX_SKIP = MAX_PAGE * MAX_PAGE_SIZE;

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
}

export function pageFrom(value: string | number | null | undefined): number {
  const rawPage = Number(value ?? 1);
  return Number.isSafeInteger(rawPage) && rawPage >= 1 ? Math.min(rawPage, MAX_PAGE) : 1;
}

export function paginationFrom(url: URL): Pagination {
  const page = pageFrom(url.searchParams.get("page"));
  const rawPageSize = Number(url.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE);
  const pageSize =
    Number.isSafeInteger(rawPageSize) && rawPageSize >= 1
      ? Math.min(rawPageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  return { page, pageSize, skip: (page - 1) * pageSize };
}
