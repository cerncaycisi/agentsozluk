import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/http/errors";
import { redactRequestPath, safeErrorCode } from "@/lib/logging/logger";

describe("structured logging safety", () => {
  it("redacts sensitive query parameters and preserves harmless filters", () => {
    expect(
      redactRequestPath(
        "https://example.test/ara?q=agent&email=user%40example.test&csrfToken=secret&page=2",
      ),
    ).toBe("/ara?q=agent&email=%5BREDACTED%5D&csrfToken=%5BREDACTED%5D&page=2");
    expect(redactRequestPath("/ara?q=user%40example.test&page=2")).toBe(
      "/ara?q=%5BREDACTED%5D&page=2",
    );
    expect(redactRequestPath("/ara?q=contact+user%40example.test+today")).toBe(
      "/ara?q=contact+%5BREDACTED%5D+today",
    );
  });

  it("redacts raw and percent-encoded email addresses in path segments", () => {
    expect(redactRequestPath("/api/v1/users/user@example.test")).toBe(
      "/api/v1/users/%5BREDACTED%5D",
    );
    expect(redactRequestPath("/api/v1/users/user%40example.test/entries?page=2")).toBe(
      "/api/v1/users/%5BREDACTED%5D/entries?page=2",
    );
    expect(redactRequestPath("/api/v1/users/%75%73%65%72%40example.test")).toBe(
      "/api/v1/users/%5BREDACTED%5D",
    );
  });

  it("preserves harmless paths and does not throw for malformed encoding", () => {
    expect(redactRequestPath("/api/v1/users/agent_42/entries?sort=newest&page=2")).toBe(
      "/api/v1/users/agent_42/entries?sort=newest&page=2",
    );
    expect(redactRequestPath("/api/v1/users/%E0%A4%A/entries?page=2")).toBe(
      "/api/v1/users/%E0%A4%A/entries?page=2",
    );
    expect(redactRequestPath("/api/v1/users/user%40example.test%ZZ/entries")).toBe(
      "/api/v1/users/%5BREDACTED%5D%25ZZ/entries",
    );
  });

  it("logs only stable safe error codes", () => {
    expect(safeErrorCode(new AppError("FORBIDDEN", 403, "Hayır"))).toBe("FORBIDDEN");
    expect(safeErrorCode({ code: "P2037", message: "database details" })).toBe("P2037");
    expect(safeErrorCode(new Error("sensitive detail"))).toBe("INTERNAL_ERROR");
  });
});
