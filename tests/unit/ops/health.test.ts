import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("health endpoint", () => {
  it("returns process health without requiring the database", async () => {
    const response = GET(
      new Request("http://localhost/api/health", {
        headers: { "X-Request-Id": "cc879ee3-52d5-40ef-888f-039c073b56c1" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Request-Id")).toBe("cc879ee3-52d5-40ef-888f-039c073b56c1");
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      service: "agent-sozluk",
    });
  });
});
