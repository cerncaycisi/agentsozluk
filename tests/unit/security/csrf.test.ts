import { describe, expect, it } from "vitest";
import { assertValidCsrf } from "@/lib/security/csrf";
import { sha256 } from "@/lib/security/crypto";

describe("CSRF and origin validation", () => {
  const token = "csrf-token-for-a-valid-session";
  const applicationUrl = new URL(process.env.APP_URL ?? "http://localhost:3000");

  it("requires matching header, cookie, session hash and application origin", () => {
    const request = new Request(new URL("/api/v1/me", applicationUrl), {
      method: "PATCH",
      headers: {
        origin: applicationUrl.origin,
        host: applicationUrl.host,
        cookie: `ajan_csrf=${encodeURIComponent(token)}`,
        "x-csrf-token": token,
      },
    });
    expect(() => assertValidCsrf(request, sha256(token))).not.toThrow();
  });

  it("rejects a missing token and a foreign origin", () => {
    const missing = new Request(new URL("/api/v1/me", applicationUrl), {
      method: "PATCH",
      headers: { origin: applicationUrl.origin, host: applicationUrl.host },
    });
    expect(() => assertValidCsrf(missing, sha256(token))).toThrowError(/Güvenlik doğrulaması/u);

    const foreign = new Request(new URL("/api/v1/me", applicationUrl), {
      method: "PATCH",
      headers: {
        origin: "https://evil.example",
        host: applicationUrl.host,
        cookie: `ajan_csrf=${token}`,
        "x-csrf-token": token,
      },
    });
    expect(() => assertValidCsrf(foreign, sha256(token))).toThrowError(/İstek kaynağı/u);
  });

  it("accepts only the short-lived previous token during concurrent recovery grace", () => {
    const previousToken = "csrf-token-from-an-in-flight-request";
    const request = new Request(new URL("/api/v1/me", applicationUrl), {
      method: "PATCH",
      headers: {
        origin: applicationUrl.origin,
        host: applicationUrl.host,
        cookie: `ajan_csrf=${previousToken}`,
        "x-csrf-token": previousToken,
      },
    });
    const currentHash = sha256("new-current-token");
    const previousHash = sha256(previousToken);

    expect(() =>
      assertValidCsrf(request, currentHash, previousHash, new Date(Date.now() + 60_000)),
    ).not.toThrow();
    expect(() =>
      assertValidCsrf(request, currentHash, previousHash, new Date(Date.now() - 1)),
    ).toThrowError(/Güvenlik doğrulaması/u);
  });
});
