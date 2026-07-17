import { beforeEach, describe, expect, it, vi } from "vitest";

const checkDatabaseReadiness = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/readiness", () => ({ checkDatabaseReadiness }));

import { GET } from "@/app/api/ready/route";

const readinessRequest = () =>
  new Request("http://localhost/api/ready", {
    headers: { "X-Request-Id": "977b2c4d-e8bd-44e6-b3bc-0faf6e73aba5" },
  });

describe("readiness endpoint", () => {
  beforeEach(() => checkDatabaseReadiness.mockReset());

  it("returns 200 after the database accepts SELECT 1", async () => {
    checkDatabaseReadiness.mockResolvedValueOnce(undefined);
    const response = await GET(readinessRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-Id")).toBe("977b2c4d-e8bd-44e6-b3bc-0faf6e73aba5");
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      service: "agent-sozluk",
    });
    expect(checkDatabaseReadiness).toHaveBeenCalledOnce();
  });

  it("returns a generic 503 without database error details", async () => {
    checkDatabaseReadiness.mockRejectedValueOnce(
      new Error("password authentication failed for user private_database_user"),
    );
    const response = await GET(readinessRequest());
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain('"status":"not_ready"');
    expect(body).not.toContain("password authentication failed");
    expect(body).not.toContain("private_database_user");
  });
});
