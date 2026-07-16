import { describe, expect, it } from "vitest";
import { successList } from "@/lib/http/api";
import { paginationFrom } from "@/lib/http/pagination";
import { requestIdFrom } from "@/lib/http/request";

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
});
