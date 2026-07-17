const sensitiveMetadataKey = /password|passwordHash|token|authorization|cookie|email/iu;

/**
 * Audit metadata is deliberately allow-by-shape and deny-by-secret-name.
 * The recursive walk keeps secrets out of nested arrays and objects as well as
 * the top-level audit record.
 */
export function assertSafeAuditMetadata(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertSafeAuditMetadata(item);
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      if (sensitiveMetadataKey.test(key)) throw new Error("SENSITIVE_AUDIT_METADATA");
      assertSafeAuditMetadata(nestedValue);
    }
  }
}
