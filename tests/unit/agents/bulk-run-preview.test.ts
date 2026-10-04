import { describe, expect, it } from "vitest";
import {
  issueBulkRunPreview,
  verifyBulkRunPreview,
} from "@/modules/agents/domain/bulk-run-preview";

const secret = "test-only-bulk-preview-signing-secret";
const now = new Date("2026-10-04T12:00:00Z");

describe("actor-bound bulk preview receipt", () => {
  it("accepts the exact actor and state digest within its bounded lifetime", () => {
    const issued = issueBulkRunPreview(secret, "admin-a", "a".repeat(64), now);
    expect(
      verifyBulkRunPreview(
        secret,
        "admin-a",
        issued.previewToken,
        new Date(now.getTime() + 599_999),
      ),
    ).toEqual({ id: issued.previewId, stateHash: "a".repeat(64) });
  });
  it.each(["actor", "key", "digest", "version", "signature"])("rejects modified %s", (field) => {
    const { previewToken } = issueBulkRunPreview(secret, "admin-a", "a".repeat(64), now);
    const changed =
      field === "digest"
        ? previewToken.replace("a".repeat(64), "b".repeat(64))
        : field === "version"
          ? previewToken.replace(/^v1/u, "v2")
          : field === "signature"
            ? `${previewToken.slice(0, -1)}${previewToken.endsWith("A") ? "B" : "A"}`
            : previewToken;
    expect(() =>
      verifyBulkRunPreview(
        field === "key" ? "other-key" : secret,
        field === "actor" ? "admin-b" : "admin-a",
        changed,
        now,
      ),
    ).toThrow();
  });
  it.each([-1, 600_000])("rejects future or expired issue time at %s ms", (offset) => {
    const { previewToken } = issueBulkRunPreview(secret, "admin-a", "a".repeat(64), now);
    expect(() =>
      verifyBulkRunPreview(secret, "admin-a", previewToken, new Date(now.getTime() + offset)),
    ).toThrow();
  });
});
