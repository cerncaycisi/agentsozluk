import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/http/errors";
import { redactRequestPath, safeErrorCode, safeErrorDiagnostics } from "@/lib/logging/logger";

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

  it("records the class name and stack frames of an unexpected error, never its message", () => {
    // Mesaj sır taşıyabilir; çok satırlı mesajdaki "at …" satırı da çerçeve sayılmaz.
    class DriverError extends Error {}
    const error = new DriverError(
      "insert failed for user@example.test token=abc123\n    at secret@example.test",
    );
    error.stack = [
      "DriverError: insert failed for user@example.test token=abc123",
      "    at secret@example.test",
      "    at createUser (/app/src/modules/auth/repository/users.ts:42:11)",
      "    at async runApi (file:///app/src/lib/http/api.ts:47:26)",
      "    at node:internal/process/task_queues:105:5",
      "    at /app/node_modules/.pnpm/pg@8/node_modules/pg/lib/client.js:545:17",
    ].join("\n");
    const diagnostics = safeErrorDiagnostics(error);
    expect(diagnostics).toEqual({
      errorName: "DriverError",
      errorFrames: [
        "createUser src/modules/auth/repository/users.ts:42:11",
        "async runApi src/lib/http/api.ts:47:26",
        "node:internal/process/task_queues:105:5",
        "node_modules/pg/lib/client.js:545:17",
      ],
    });
    const serialized = JSON.stringify(diagnostics);
    for (const secret of ["user@example.test", "secret@example.test", "abc123", "insert failed"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("adds no diagnostics for expected application errors and caps the frame count", () => {
    expect(safeErrorDiagnostics(new AppError("FORBIDDEN", 403, "Yasak."))).toBeNull();
    expect(safeErrorDiagnostics("düz metin")).toEqual({ errorName: "NonError", errorFrames: [] });
    const deep = new Error("x");
    deep.stack = [
      "Error: x",
      ...Array.from({ length: 30 }, (_, i) => `    at f${i} (/app/src/a.ts:${i + 1}:1)`),
    ].join("\n");
    expect(safeErrorDiagnostics(deep)?.errorFrames).toHaveLength(10);
  });
});
