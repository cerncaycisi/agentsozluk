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
const allowedSensitiveCompoundKeyNames = new Set([
  "cachedinputtokens",
  "candidatetokens",
  "credentialid",
  "credentialids",
  "currentpromptprofilehash",
  "framingtokencount",
  "framingtokens",
  "inputtokens",
  "leasetokenfingerprint",
  "lefttokens",
  "outputtokens",
  "promptprofilehash",
  "reasoningtokens",
  "righttokens",
  "tokencount",
  "tokenusage",
  "totaltokens",
]);
const sensitiveLifeKeyFragments = [
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
  "privatekey",
  "rawcredential",
  "rawprompt",
  "rawreasoning",
  "refreshtoken",
  "secret",
  "setcookie",
  "systemprompt",
  "token",
] as const;

const credentialLikeValue =
  /(?:\bsk-[A-Za-z0-9_-]{20,}\b|\bagt_[A-Za-z0-9_-]{30,}\b|\bBearer\s+[A-Za-z0-9._~+/=-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*[^\s,;]{8,}|[?&](?:token|key|sig|signature|credential|x-amz-[^=]+|x-goog-[^=]+)=[^&#\s]{4,})/iu;
const emailValue = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const urlValue = /(?:https?:\/\/|www\.)/iu;
const controlCharacter = /[\u0000-\u001f\u007f]/u;
const nonAsciiWhitespace = /[\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/u;
const htmlElement = /<\/?[a-z][^>]*>/iu;
const otpLikeValue =
  /(?:^\s*\d{6}\s*$|\b(?:otp|one[- ]?time(?: password| code)?|verification(?: code)?|doğrulama(?: kodu)?|giriş kodu)\b\D{0,32}\d{6}\b)/iu;
const opaqueTokenCandidates = /[A-Za-z0-9_-]{24,}/gu;
const embeddedDigest = /(?:^|[^a-f0-9])(?:[a-f0-9]{64}|[a-f0-9]{40})(?=$|[^a-f0-9])/iu;
const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const canonicalDigest = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu;
const canonicalNumericIdentifier = /^\d+$/u;
const canonicalDnsHostname =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/u;
const canonicalDomainFieldNames = new Set(["normalizeddomain", "sourcedomain"]);
const canonicalUuidFieldNames = new Set([
  "actionid",
  "affectedmemoryid",
  "agentid",
  "agentids",
  "agentprofileid",
  "agentuserid",
  "attemptid",
  "authorid",
  "batchid",
  "beliefid",
  "blockedid",
  "blockeduserid",
  "blockeduserids",
  "blockerid",
  "blockinguserids",
  "bookmarkedentryids",
  "capacitysnapshotid",
  "childid",
  "cohortagentid",
  "cohortagentids",
  "commandid",
  "createdbyid",
  "credentialid",
  "currentpersonaversionid",
  "currentrunid",
  "currentversionid",
  "dailyplanid",
  "dryrunid",
  "entryid",
  "evidenceid",
  "evidenceids",
  "followedid",
  "followedtopicid",
  "followedtopicids",
  "followeduserid",
  "followeduserids",
  "followerid",
  "id",
  "memoryid",
  "normalwakeentryid",
  "normalwakerunid",
  "personaversionid",
  "replytoentryid",
  "reportid",
  "runid",
  "scheduleid",
  "scheduleslotid",
  "sourceid",
  "sourcememoryid",
  "sourcememoryids",
  "subjectid",
  "targetid",
  "targetuserid",
  "topicid",
  "userid",
]);
const canonicalNumericIdentifierFieldNames = new Set([
  "afterid",
  "causedbyeventid",
  "causedbyeventids",
  "checkpointeventid",
  "checkpointeventids",
  "cirunid",
  "decisioneventid",
  "eventid",
  "runtimeeventid",
  "selectedeventid",
  "startedeventid",
]);
const canonicalDigestFieldNames = new Set([
  "backupchecksum",
  "baselinehash",
  "bootidhash",
  "candidatehash",
  "candidatepackhash",
  "contenthash",
  "contenthashes",
  "contexthash",
  "currentpromptprofilehash",
  "discoveredfromhash",
  "eventhash",
  "evidencehash",
  "evidenceprovenancehash",
  "evidencesummaryhash",
  "inputhash",
  "lasterrorsummaryhash",
  "ledgerintegrityhash",
  "leasetokenfingerprint",
  "maingitsha",
  "ngramhash",
  "ngramhashes",
  "previouseventhash",
  "productiongitsha",
  "promptprofilehash",
  "provenancehash",
  "rejectionreasonhash",
  "requesthash",
  "restorefingerprint",
  "resulthash",
  "runtimemetadatahash",
  "statementhash",
  "summaryhash",
  "topickeyhash",
  "topicshash",
  "urlhash",
  "validationresulthash",
]);

function normalizedKey(value: string): string {
  return value.replaceAll(/[^a-z0-9]/giu, "").toLowerCase();
}

function isSensitiveLifeKeyName(value: string): boolean {
  const normalized = normalizedKey(value);
  if (allowedSensitiveCompoundKeyNames.has(normalized)) return false;
  return (
    sensitiveLifeKeyNames.has(normalized) ||
    sensitiveLifeKeyFragments.some((fragment) => normalized.includes(fragment))
  );
}

function looksLikeUnrecognizedTypedField(value: string): boolean {
  return (
    /(?:Id|Ids|Hash|Hashes|Sha|Checksum|Fingerprint|Digest)$/u.test(value) ||
    /(?:_|-)(?:id|ids|hash|hashes|sha|checksum|fingerprint|digest)$/iu.test(value)
  );
}

export function isSafeLifeLedgerText(value: string): boolean {
  if (canonicalUuid.test(value) || canonicalDigest.test(value)) return false;
  const highEntropyOpaqueValue = [...value.matchAll(opaqueTokenCandidates)].some(({ 0: token }) => {
    if (canonicalUuid.test(token)) return false;
    return /[a-z]/u.test(token) && /[A-Z]/u.test(token) && /\d/u.test(token);
  });
  return (
    !controlCharacter.test(value) &&
    !nonAsciiWhitespace.test(value) &&
    !htmlElement.test(value) &&
    !credentialLikeValue.test(value) &&
    !emailValue.test(value) &&
    !urlValue.test(value) &&
    !otpLikeValue.test(value) &&
    !embeddedDigest.test(value) &&
    !highEntropyOpaqueValue
  );
}

/**
 * Defence in depth for every durable life-ledger value. Schema validation protects
 * worker input; this guard also covers values emitted by server-side mutation hooks.
 */
type CanonicalFieldKind = "digest" | "domain" | "numeric" | "uuid";

function canonicalFieldKind(key: string | undefined): CanonicalFieldKind | undefined {
  if (!key) return undefined;
  const normalized = normalizedKey(key);
  if (canonicalDomainFieldNames.has(normalized)) return "domain";
  if (canonicalDigestFieldNames.has(normalized)) return "digest";
  if (canonicalNumericIdentifierFieldNames.has(normalized)) return "numeric";
  if (
    canonicalUuidFieldNames.has(normalized) ||
    /(?:Id|Ids)$/u.test(key) ||
    /(?:_|-)(?:id|ids)$/iu.test(key)
  )
    return "uuid";
  return undefined;
}

function isPluralCanonicalField(key: string | undefined): boolean {
  if (!key) return false;
  return /(?:Ids|Hashes)$/u.test(key) || /(?:_|-)(?:ids|hashes)$/iu.test(key);
}

function isCanonicalDomainValue(value: string): boolean {
  if (value !== value.toLowerCase() || value === "localhost" || value.endsWith(".local"))
    return false;
  const textForSafety = value.startsWith("www.") ? value.slice(4) : value;
  if (!isSafeLifeLedgerText(textForSafety)) return false;
  if (!value.includes(":")) return canonicalDnsHostname.test(value);
  const ipv6Value = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  if (ipv6Value.includes("[") || ipv6Value.includes("]")) return false;
  try {
    const parsed = new URL(`http://[${ipv6Value}]/`);
    return parsed.hostname.slice(1, -1) === ipv6Value;
  } catch {
    return false;
  }
}

function isCanonicalFieldValue(kind: CanonicalFieldKind, value: string): boolean {
  if (kind === "digest") return canonicalDigest.test(value);
  if (kind === "domain") return isCanonicalDomainValue(value);
  if (kind === "uuid") return canonicalUuid.test(value);
  return canonicalNumericIdentifier.test(value);
}

function assertSafeLifeLedgerValueAtKey(value: unknown, key?: string): void {
  const fieldKind = canonicalFieldKind(key);
  if (fieldKind) {
    if (value === null || value === undefined) return;
    if (isPluralCanonicalField(key)) {
      if (
        Array.isArray(value) &&
        value.every((item) => typeof item === "string" && isCanonicalFieldValue(fieldKind, item))
      )
        return;
    } else if (typeof value === "string" && isCanonicalFieldValue(fieldKind, value)) return;
    throw new Error(`UNSAFE_AGENT_LIFE_EVENT_VALUE:${key ? normalizedKey(key) : "root"}`);
  }
  if (typeof value === "string") {
    if (!isSafeLifeLedgerText(value))
      throw new Error(`UNSAFE_AGENT_LIFE_EVENT_VALUE:${key ? normalizedKey(key) : "root"}`);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSafeLifeLedgerValueAtKey(item, key);
    return;
  }
  if (!value || typeof value !== "object" || value instanceof Date) return;
  for (const [objectKey, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveLifeKeyName(objectKey)) throw new Error("SENSITIVE_AGENT_LIFE_EVENT_KEY");
    if (!canonicalFieldKind(objectKey) && looksLikeUnrecognizedTypedField(objectKey))
      throw new Error(`UNSAFE_AGENT_LIFE_EVENT_KEY:${normalizedKey(objectKey)}`);
    if (!isSafeLifeLedgerText(objectKey)) throw new Error("UNSAFE_AGENT_LIFE_EVENT_KEY");
    assertSafeLifeLedgerValueAtKey(nested, objectKey);
  }
}

export function assertSafeLifeLedgerValue(value: unknown): void {
  assertSafeLifeLedgerValueAtKey(value);
}
