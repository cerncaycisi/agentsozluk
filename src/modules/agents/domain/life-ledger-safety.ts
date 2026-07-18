const sensitiveLifeKeyNames = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "chainofthought",
  "cookie",
  "credential",
  "email",
  "hiddenreasoning",
  "internalmonologue",
  "leasetoken",
  "password",
  "passwordhash",
  "privatekey",
  "rawcredential",
  "rawprompt",
  "rawreasoning",
  "refreshtoken",
  "secret",
  "setcookie",
  "systemprompt",
  "token",
]);

const credentialLikeValue =
  /(?:\bsk-[A-Za-z0-9_-]{20,}\b|\bagt_[A-Za-z0-9_-]{30,}\b|\bBearer\s+[A-Za-z0-9._~+/=-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*[^\s,;]{8,}|[?&](?:token|key|sig|signature|credential|x-amz-[^=]+|x-goog-[^=]+)=[^&#\s]{4,})/iu;
const emailValue = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const controlCharacter = /[\u0000-\u001f\u007f]/u;
const htmlElement = /<\/?[a-z][^>]*>/iu;

function normalizedKey(value: string): string {
  return value.replaceAll(/[^a-z0-9]/giu, "").toLowerCase();
}

export function isSafeLifeLedgerText(value: string): boolean {
  return (
    !controlCharacter.test(value) &&
    !htmlElement.test(value) &&
    !credentialLikeValue.test(value) &&
    !emailValue.test(value)
  );
}

/**
 * Defence in depth for every durable life-ledger value. Schema validation protects
 * worker input; this guard also covers values emitted by server-side mutation hooks.
 */
export function assertSafeLifeLedgerValue(value: unknown): void {
  if (typeof value === "string") {
    if (!isSafeLifeLedgerText(value)) throw new Error("UNSAFE_AGENT_LIFE_EVENT_VALUE");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSafeLifeLedgerValue(item);
    return;
  }
  if (!value || typeof value !== "object" || value instanceof Date) return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveLifeKeyNames.has(normalizedKey(key)))
      throw new Error("SENSITIVE_AGENT_LIFE_EVENT_KEY");
    assertSafeLifeLedgerValue(nested);
  }
}
