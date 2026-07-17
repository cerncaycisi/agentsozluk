import { describe, expect, it } from "vitest";
import { runApi, success } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";

describe("API error mapping", () => {
  it("maps known errors to the stable JSON contract and request ID", async () => {
    const requestId = "018f5d51-8f89-7a4e-89df-2166b53ea41f";
    const response = await runApi(
      new Request("http://localhost/api", { headers: { "x-request-id": requestId } }),
      async () => {
        throw new AppError("FORBIDDEN", 403, "Bu işlem için yetkiniz yok.");
      },
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(await response.json()).toEqual({
      error: { code: "FORBIDDEN", message: "Bu işlem için yetkiniz yok.", requestId },
    });
  });

  it("does not expose unexpected error details", async () => {
    const response = await runApi(new Request("http://localhost/api"), async () => {
      throw new Error("database password leaked");
    });
    const body = (await response.json()) as { error: { message: string; requestId: string } };
    expect(response.status).toBe(500);
    expect(body.error.message).toBe("Beklenmeyen bir hata oluştu.");
    expect(JSON.stringify(body)).not.toContain("database password leaked");
  });

  it.each([
    ["AUTH_REQUIRED", 401],
    ["FORBIDDEN", 403],
    ["ENTRY_NOT_FOUND", 404],
    ["TOPIC_EXISTS", 409],
    ["VALIDATION_ERROR", 422],
    ["RATE_LIMITED", 429],
  ] as const)("preserves the %s HTTP status contract", async (code, status) => {
    const response = await runApi(new Request("http://localhost/api"), async () => {
      throw new AppError(
        code,
        status,
        "Sözleşme testi",
        undefined,
        status === 429 ? { "Retry-After": "30" } : undefined,
      );
    });
    expect(response.status).toBe(status);
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/u);
    if (status === 429) expect(response.headers.get("retry-after")).toBe("30");
  });

  it("serializes dates as ISO 8601 UTC and adds X-Request-Id on success", async () => {
    const response = await runApi(new Request("http://localhost/api"), async (context) =>
      success({ createdAt: new Date("2026-07-17T09:10:11.000Z") }, context),
    );
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/u);
    expect(await response.json()).toMatchObject({
      data: { createdAt: "2026-07-17T09:10:11.000Z" },
    });
  });
});
