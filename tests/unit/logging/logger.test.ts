import path from "node:path";
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

  it("records only existing project files with line/column; never message, names or fake frames", () => {
    // Astra (#183): çok satırlı mesaj yol biçimli sahte çerçeve taşıyabilir; işlev/sınıf
    // adı dinamik olabilir; eval sourceURL yol uydurabilir.
    const root = process.cwd();
    const realFile = path.join(root, "src/lib/logging/logger.ts");
    const secretClass = { ["TEST_ONLY_TOKEN"]: class extends Error {} }.TEST_ONLY_TOKEN;
    const error = new secretClass(
      `driver rejected input\n    at fake (${root}/src/password=TEST_ONLY_SECRET:1:1)`,
    );
    error.stack = [
      "TEST_ONLY_TOKEN: driver rejected input user@example.test",
      `    at fake (${root}/src/password=TEST_ONLY_SECRET:1:1)`,
      `    at TEST_ONLY_TOKEN (${realFile}:42:11)`,
      `    at async runApi (file://${realFile}:47:26)`,
      `    at ${root}/src/driver.js?token=TEST_ONLY_SECRET&email=user%40example.test:1:1`,
      `    at eval (${root}/src/token=TEST_ONLY_SECRET.js:1:1)`,
      "    at node:internal/process/task_queues:105:5",
      "    at /etc/passwd:1:1",
    ].join("\n");
    const diagnostics = safeErrorDiagnostics(error);
    expect(diagnostics).toEqual({
      errorName: "Error",
      errorFrames: ["src/lib/logging/logger.ts:42:11", "src/lib/logging/logger.ts:47:26"],
    });
    const serialized = JSON.stringify(diagnostics);
    for (const secret of ["TEST_ONLY", "user@example.test", "driver rejected", "passwd"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("keeps known library error names and real frames from a thrown error", () => {
    const error = new TypeError("gizli değer 123");
    const diagnostics = safeErrorDiagnostics(error);
    expect(diagnostics?.errorName).toBe("TypeError");
    expect(diagnostics?.errorFrames[0]).toMatch(
      /^tests\/unit\/logging\/logger\.test\.ts:\d+:\d+$/u,
    );
    expect(JSON.stringify(diagnostics)).not.toContain("gizli");
  });

  it("adds no diagnostics for expected application errors and caps the frame count", () => {
    expect(safeErrorDiagnostics(new AppError("FORBIDDEN", 403, "Yasak."))).toBeNull();
    expect(safeErrorDiagnostics("düz metin")).toEqual({ errorName: "NonError", errorFrames: [] });
    const deep = new Error("x");
    const realFile = path.join(process.cwd(), "src/lib/logging/logger.ts");
    deep.stack = [
      "Error: x",
      ...Array.from({ length: 30 }, (_, i) => `    at f${i} (${realFile}:${i + 1}:1)`),
    ].join("\n");
    expect(safeErrorDiagnostics(deep)?.errorFrames).toHaveLength(10);
  });
});
