import pino from "pino";
import { AppError } from "@/lib/http/errors";

const sensitiveQueryKey =
  /authorization|code|cookie|csrf|email|key|password|secret|session|token/iu;
const emailValue =
  /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/giu;
const asciiPercentEscape = /%([0-7][0-9a-f])/giu;
const encodedRedaction = encodeURIComponent("[REDACTED]");

export const logger = pino({
  base: { service: "agent-sozluk" },
  level: process.env.NODE_ENV === "test" ? "silent" : (process.env.LOG_LEVEL ?? "info"),
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (level) => ({ level }) },
  redact: {
    paths: [
      "password",
      "passwordHash",
      "token",
      "csrfToken",
      "authorization",
      "cookie",
      "email",
      "requestBody",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.csrfToken",
      "*.authorization",
      "*.cookie",
      "*.email",
      "*.requestBody",
    ],
    censor: "[REDACTED]",
  },
});

function decodePathSegmentForRedaction(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment.replace(asciiPercentEscape, (_match, hexadecimal: string) =>
      String.fromCharCode(Number.parseInt(hexadecimal, 16)),
    );
  }
}

function redactPathname(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => {
      const decodedSegment = decodePathSegmentForRedaction(segment);
      const redactedSegment = decodedSegment.replace(emailValue, "[REDACTED]");
      return redactedSegment === decodedSegment ? segment : encodeURIComponent(redactedSegment);
    })
    .join("/");
}

export function redactRequestPath(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl, "http://localhost");
  } catch {
    return rawUrl.replace(emailValue, encodedRedaction);
  }
  for (const [key, value] of url.searchParams) {
    if (sensitiveQueryKey.test(key)) {
      url.searchParams.set(key, "[REDACTED]");
      continue;
    }
    const redactedValue = value.replace(emailValue, "[REDACTED]");
    if (redactedValue !== value) url.searchParams.set(key, redactedValue);
  }
  const query = url.searchParams.toString();
  return `${redactPathname(url.pathname)}${query ? `?${query}` : ""}`;
}

export function safeErrorCode(error: unknown): string {
  if (error instanceof AppError) return error.code;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]{2,40}$/u.test(error.code)
  ) {
    return error.code;
  }
  return "INTERNAL_ERROR";
}

export function logRequest(input: {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  actorId?: string | null;
  errorCode?: string | null;
}): void {
  const fields = {
    requestId: input.requestId,
    method: input.method,
    path: redactRequestPath(input.path),
    status: input.status,
    durationMs: input.durationMs,
    actorId: input.actorId ?? null,
    errorCode: input.errorCode ?? null,
  };
  if (input.status >= 500) logger.error(fields, "request completed");
  else if (input.status >= 400) logger.warn(fields, "request completed");
  else logger.info(fields, "request completed");
}
