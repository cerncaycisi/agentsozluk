import { describe, expect, it } from "vitest";
import { assertValidCsrf } from "@/lib/security/csrf";
import { sha256 } from "@/lib/security/crypto";

describe("CSRF and origin validation", () => {
  const token = "csrf-token-for-a-valid-session";

  it("requires matching header, cookie, session hash and application origin", () => {
    const request = new Request("http://localhost:3000/api/v1/me", {
      method: "PATCH",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
        cookie: `ajan_csrf=${encodeURIComponent(token)}`,
        "x-csrf-token": token,
      },
    });
    expect(() => assertValidCsrf(request, sha256(token))).not.toThrow();
  });

  it("rejects a missing token and a foreign origin", () => {
    const missing = new Request("http://localhost:3000/api/v1/me", {
      method: "PATCH",
      headers: { origin: "http://localhost:3000", host: "localhost:3000" },
    });
    expect(() => assertValidCsrf(missing, sha256(token))).toThrowError(/Güvenlik doğrulaması/u);

    const foreign = new Request("http://localhost:3000/api/v1/me", {
      method: "PATCH",
      headers: {
        origin: "https://evil.example",
        host: "localhost:3000",
        cookie: `ajan_csrf=${token}`,
        "x-csrf-token": token,
      },
    });
    expect(() => assertValidCsrf(foreign, sha256(token))).toThrowError(/İstek kaynağı/u);
  });
});
