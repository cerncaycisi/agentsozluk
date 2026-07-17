import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  createOpaqueToken,
  hmacIdentifier,
  sha256,
} from "@/lib/security/crypto";
import { safeInternalRedirect } from "@/lib/security/redirect";

describe("security primitives", () => {
  it("creates a 32-byte opaque token and hashes it without storing the raw value", () => {
    const token = createOpaqueToken();
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(sha256(token)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("normalizes rate-limit identifiers before HMAC", () => {
    expect(hmacIdentifier("s".repeat(32), " USER@Example.COM ")).toBe(
      hmacIdentifier("s".repeat(32), "user@example.com"),
    );
  });

  it("compares equal-length values in constant time", () => {
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("same", "different")).toBe(false);
  });

  it("blocks external, scheme-relative and backslash redirects", () => {
    expect(safeInternalRedirect("/ayarlar")).toBe("/ayarlar");
    expect(safeInternalRedirect("https://example.com")).toBe("/");
    expect(safeInternalRedirect("//example.com")).toBe("/");
    expect(safeInternalRedirect("/\\example.com")).toBe("/");
  });
});
