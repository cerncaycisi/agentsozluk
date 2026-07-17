import { describe, expect, it } from "vitest";
import { successList } from "@/lib/http/api";
import { MAX_PAGE, MAX_SKIP, pageFrom, paginationFrom } from "@/lib/http/pagination";
import { parseDate, parseUuid, requestIdFrom } from "@/lib/http/request";

describe("API pagination and request IDs", () => {
  it("defaults page to 1 and pageSize to 20", () => {
    expect(paginationFrom(new URL("https://example.test/api"))).toEqual({
      page: 1,
      pageSize: 20,
      skip: 0,
    });
  });

  it("enforces page minimum and pageSize maximum", () => {
    expect(paginationFrom(new URL("https://example.test/api?page=0&pageSize=999"))).toEqual({
      page: 1,
      pageSize: 100,
      skip: 0,
    });
  });

  it.each([
    ["1e308", 1],
    [String(Number.MAX_SAFE_INTEGER + 1), 1],
    ["-4", 1],
    ["0", 1],
    ["42", 42],
    [String(MAX_PAGE + 1), MAX_PAGE],
  ])("normalizes page %s without producing an unsafe database offset", (input, expected) => {
    expect(pageFrom(input)).toBe(expected);
  });

  it("rejects unsafe page sizes before calculating skip", () => {
    expect(
      paginationFrom(
        new URL(
          `https://example.test/api?page=${Number.MAX_SAFE_INTEGER}&pageSize=${Number.MAX_SAFE_INTEGER + 1}`,
        ),
      ),
    ).toEqual({ page: MAX_PAGE, pageSize: 20, skip: (MAX_PAGE - 1) * 20 });
    expect(
      paginationFrom(new URL("https://example.test/api?page=10000&pageSize=100")).skip,
    ).toBeLessThanOrEqual(MAX_SKIP);
  });

  it("returns the stable list metadata contract", async () => {
    const response = successList(
      ["item"],
      { requestId: "018f5d51-8f89-7a4e-89df-2166b53ea41f" },
      {
        page: 2,
        pageSize: 20,
        totalItems: 45,
      },
    );
    expect(await response.json()).toEqual({
      data: ["item"],
      meta: {
        page: 2,
        pageSize: 20,
        totalItems: 45,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      },
      requestId: "018f5d51-8f89-7a4e-89df-2166b53ea41f",
    });
  });

  it("preserves valid UUID request IDs and replaces invalid values", () => {
    const valid = "018f5d51-8f89-7a4e-89df-2166b53ea41f";
    expect(
      requestIdFrom(new Request("https://example.test", { headers: { "X-Request-Id": valid } })),
    ).toBe(valid);
    expect(
      requestIdFrom(
        new Request("https://example.test", { headers: { "X-Request-Id": "invalid" } }),
      ),
    ).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  });

  it("validates UUID path parameters and date filters before data access", () => {
    expect(parseUuid("018F5D51-8F89-4A4E-89DF-2166B53EA41F", "entryId")).toBe(
      "018f5d51-8f89-4a4e-89df-2166b53ea41f",
    );
    expect(() => parseUuid("not-a-uuid", "entryId")).toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR", status: 422 }),
    );
    expect(parseDate("2026-07-17T09:10:11.000Z", "from").toISOString()).toBe(
      "2026-07-17T09:10:11.000Z",
    );
    expect(() => parseDate("not-a-date", "from")).toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR", status: 422 }),
    );
  });
});
