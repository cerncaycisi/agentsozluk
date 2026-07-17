import type { TransactionClient } from "@/lib/db/types";
import { describe, expect, it, vi } from "vitest";
import { appendAuditLog } from "@/modules/audit/application/audit";
import { assertSafeAuditMetadata } from "@/modules/audit/domain/metadata";

describe("audit metadata safety", () => {
  it("accepts safe nested metadata", () => {
    expect(() =>
      assertSafeAuditMetadata({ target: { changes: [{ field: "status", value: "HIDDEN" }] } }),
    ).not.toThrow();
  });

  it.each(["password", "passwordHash", "accessToken", "authorization", "cookie", "email"])(
    "rejects a nested %s field",
    (field) => {
      expect(() => assertSafeAuditMetadata({ target: [{ actor: { [field]: "secret" } }] })).toThrow(
        "SENSITIVE_AUDIT_METADATA",
      );
    },
  );

  it("validates and persists a safe application-level audit command", async () => {
    const create = vi.fn().mockResolvedValue({ id: "audit-id" });
    const transaction = { auditLog: { create } } as unknown as TransactionClient;
    await appendAuditLog(transaction, {
      actorId: "018f5d51-8f89-7a4e-89df-2166b53ea41f",
      action: "topic.created",
      entityType: "Topic",
      entityId: "018f5d51-8f89-7a4e-89df-2166b53ea420",
      requestId: "018f5d51-8f89-7a4e-89df-2166b53ea421",
      metadata: { origin: "WEB" },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "topic.created", metadata: { origin: "WEB" } }),
    });
  });
});
