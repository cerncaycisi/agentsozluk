import { describe, expect, it } from "vitest";
import { runApi } from "@/lib/http/api";
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
});
