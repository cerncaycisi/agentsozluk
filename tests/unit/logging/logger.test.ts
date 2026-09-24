import { readdirSync } from "node:fs";
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

  it("never logs line/column numbers, so a message cannot leak digits through a frame", () => {
    // Astra (#183 3. tur): mesaj stack oluştuktan sonra kısaltılınca başlık kontrolü
    // aşılıyordu. Satır/sütun hiç kaydedilmediği için sayısal sır kanalı yok.
    const realFile = path.join(process.cwd(), "src/lib/logging/logger.ts");
    const error = new Error(`rejected user@example.test\n    at fake (${realFile}:424242:987654)`);
    void error.stack;
    error.message = "rejected";
    const diagnostics = safeErrorDiagnostics(error);
    const serialized = JSON.stringify(diagnostics);
    for (const secret of ["424242", "987654", "user@example.test", "rejected"]) {
      expect(serialized).not.toContain(secret);
    }
    for (const frame of diagnostics?.errorFrames ?? []) expect(frame).not.toMatch(/:\d/u);
  });

  it("keeps only existing project files as relative paths, deduplicating repeats", () => {
    const root = process.cwd();
    const realFile = path.join(root, "src/lib/logging/logger.ts");
    const error = new Error("x");
    error.stack = [
      String(error),
      `    at TEST_ONLY_NAME (${realFile}:42:11)`,
      `    at async runApi (file://${realFile}:47:26)`,
      `    at ${root}/src/driver.js?token=TEST_ONLY_SECRET&email=user%40example.test:1:1`,
      `    at eval (${root}/src/token=TEST_ONLY_SECRET.js:1:1)`,
      `    at ${root}/src/../../etc/passwd:1:1`,
      "    at node:internal/process/task_queues:105:5",
      `    at other (${path.join(root, "src/lib/http/api.ts")}:10:1)`,
    ].join("\n");
    const diagnostics = safeErrorDiagnostics(error);
    expect(diagnostics).toEqual({
      errorName: "Error",
      errorFrames: ["src/lib/logging/logger.ts", "src/lib/http/api.ts"],
    });
    expect(JSON.stringify(diagnostics)).not.toContain("TEST_ONLY");
  });

  it("never throws, even when the error's own accessors throw", () => {
    const hostile = new Error("x");
    Object.defineProperty(hostile, "stack", {
      get() {
        throw new Error("stack getter");
      },
    });
    Object.defineProperty(hostile, "name", {
      get() {
        throw new Error("name getter");
      },
    });
    expect(safeErrorDiagnostics(hostile)).toEqual({ errorName: "Error", errorFrames: [] });

    // Adı ilk okumada izinli, sonra hassas dönen getter: tek okuma.
    const shifty = new Error("x");
    let reads = 0;
    Object.defineProperty(shifty, "name", {
      get() {
        reads += 1;
        return reads === 1 ? "TypeError" : "TEST_ONLY_SECRET";
      },
    });
    Object.defineProperty(shifty, "constructor", { value: { name: "Unknown" } });
    expect(JSON.stringify(safeErrorDiagnostics(shifty))).not.toContain("TEST_ONLY");

    // instanceof'u fırlatan Proxy de yanıtı bozmaz.
    const trap = new Proxy(new Error("x"), {
      getPrototypeOf() {
        throw new Error("proxy");
      },
    });
    expect(safeErrorDiagnostics(trap)).toEqual({ errorName: "Error", errorFrames: [] });
  });

  it("adds no diagnostics for expected application errors and caps the frame count", () => {
    expect(safeErrorDiagnostics(new AppError("FORBIDDEN", 403, "Yasak."))).toBeNull();
    expect(safeErrorDiagnostics("düz metin")).toEqual({ errorName: "NonError", errorFrames: [] });
    const files = readdirSync(path.join(process.cwd(), "src/lib"), { recursive: true })
      .map(String)
      .filter((name) => name.endsWith(".ts"))
      .slice(0, 30)
      .map((name) => path.join(process.cwd(), "src/lib", name));
    const deep = new Error("x");
    deep.stack = [String(deep), ...files.map((file, i) => `    at f${i} (${file}:1:1)`)].join("\n");
    expect(safeErrorDiagnostics(deep)?.errorFrames).toHaveLength(10);
  });
});
