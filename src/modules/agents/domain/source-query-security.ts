const sensitiveSourceQueryNames = new Set([
  "accesstoken",
  "apikey",
  "auth",
  "authorization",
  "awsaccesskeyid",
  "credential",
  "expires",
  "googleaccessid",
  "key",
  "password",
  "policy",
  "refreshtoken",
  "secret",
  "sig",
  "signature",
  "token",
]);

function normalizedQueryName(value: string): string {
  return value.replaceAll(/[^a-z0-9]/giu, "").toLowerCase();
}

export function sourceUrlHasSensitiveQuery(url: URL): boolean {
  return [...url.searchParams.keys()].some((name) => {
    const normalized = normalizedQueryName(name);
    return (
      sensitiveSourceQueryNames.has(normalized) ||
      normalized.startsWith("xamz") ||
      normalized.startsWith("xgoog")
    );
  });
}
