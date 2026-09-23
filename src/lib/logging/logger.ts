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

/*
  Beklenmeyen hatanın tanısı (18 Eylül incelemesi, "küçük ama biriken"): merkezi
  kayıtta yalnız `INTERNAL_ERROR` kalıyordu, gerçek neden bulunamıyordu. Kaydedilen
  yalnız hata sınıfının adı ve stack ÇERÇEVELERİDİR. Hata mesajı hiç kaydedilmez:
  sürücü ve kütüphane mesajları sorgu parametresi, e-posta ya da token taşıyabilir.
  Çerçeve yalnız katı `at işlev (yol:satır:sütun)` biçimine uyuyorsa alınır; çok
  satırlı bir mesajın "at …" diye başlayan satırı yol biçimine uymadıkça düşer. Yol
  proje köküne göre kısaltılır, e-posta biçimi yine sansürlenir.
*/
const identifier = /^[A-Za-z][A-Za-z0-9_]{0,60}$/u;
const stackFrame =
  /^\s+at (?:([\w.$<>[\] ]{1,120}) \()?((?:file:\/\/|node:|\/)[^\s()]{1,400}):(\d{1,7}):(\d{1,7})\)?$/u;
const maxFrames = 10;

function shortFramePath(path: string): string {
  if (path.startsWith("node:")) return path;
  const withoutScheme = path.replace(/^file:\/\//u, "");
  for (const marker of ["/node_modules/", "/src/", "/scripts/", "/.next/"]) {
    const index = withoutScheme.lastIndexOf(marker);
    if (index >= 0) return withoutScheme.slice(index + 1);
  }
  return withoutScheme.split("/").slice(-2).join("/");
}

export function safeErrorDiagnostics(
  error: unknown,
): { errorName: string; errorFrames: string[] } | null {
  if (error instanceof AppError) return null;
  if (!(error instanceof Error)) return { errorName: "NonError", errorFrames: [] };
  const constructorName = error.constructor?.name ?? "";
  const errorName = identifier.test(constructorName)
    ? constructorName
    : identifier.test(error.name)
      ? error.name
      : "Error";
  const errorFrames: string[] = [];
  for (const line of (error.stack ?? "").split("\n")) {
    const match = stackFrame.exec(line);
    if (!match) continue;
    const [, fn, path, row, column] = match;
    const frame = `${fn ? `${fn} ` : ""}${shortFramePath(path ?? "")}:${row}:${column}`;
    errorFrames.push(frame.replace(emailValue, "[REDACTED]"));
    if (errorFrames.length === maxFrames) break;
  }
  return { errorName, errorFrames };
}

export function logRequest(input: {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  actorId?: string | null;
  errorCode?: string | null;
  diagnostics?: { errorName: string; errorFrames: string[] } | null;
}): void {
  const fields = {
    requestId: input.requestId,
    method: input.method,
    path: redactRequestPath(input.path),
    status: input.status,
    durationMs: input.durationMs,
    actorId: input.actorId ?? null,
    errorCode: input.errorCode ?? null,
    ...(input.diagnostics ? input.diagnostics : {}),
  };
  if (input.status >= 500) logger.error(fields, "request completed");
  else if (input.status >= 400) logger.warn(fields, "request completed");
  else logger.info(fields, "request completed");
}
