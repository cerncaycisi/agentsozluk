import { statSync } from "node:fs";
import nodePath from "node:path";
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
  kayıtta yalnız `INTERNAL_ERROR` kalıyordu, gerçek neden bulunamıyordu.

  Stack metni GÜVENİLMEZDİR (Astra, #183): ilk satırlar hata mesajıdır ve çok
  satırlı bir mesaj yol biçimli sahte "at …" satırları içerebilir; işlev/sınıf
  adları dinamik olabilir; `eval` `sourceURL` ile yol uydurabilir. Bu yüzden:
  - hata adı yalnız bilinen sınıflardan (izin listesi), aksi hâlde `Error`;
  - işlev adı hiç kaydedilmez;
  - bir çerçeve yalnız proje kökü altında DİSKTE VAR OLAN bir dosyayı gösteriyorsa
    alınır ve yalnız göreli yolu kaydedilir (satır/sütun yok). Mesajdaki uydurma yol,
    `?token=` taşıyan yol ya da `eval` kaynağı diskte yoktur, düşer;
  - `node:` çerçeveleri alınmaz; en çok 16 KiB / 200 satır taranır, 10 çerçeve kalır.
  Hata mesajı hiçbir koşulda kaydedilmez.
*/
const knownErrorNames = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "EvalError",
  "URIError",
  "AggregateError",
  "AbortError",
  "TimeoutError",
  "ZodError",
  "PrismaClientKnownRequestError",
  "PrismaClientUnknownRequestError",
  "PrismaClientValidationError",
  "PrismaClientInitializationError",
  "PrismaClientRustPanicError",
]);
const stackFrame =
  /^\s+at (?:.{0,200}? \()?(?:file:\/\/)?(\/[^\s()]{1,400}):(\d{1,7}):(\d{1,7})\)?$/u;
const maxFrames = 10;
const maxStackCharacters = 16_384;
const maxStackLines = 200;
const existingProjectFiles = new Map<string, boolean>();

function projectRelativeFile(candidate: string): string | null {
  const root = process.cwd();
  const resolved = nodePath.resolve(candidate);
  if (!resolved.startsWith(`${root}${nodePath.sep}`)) return null;
  let exists = existingProjectFiles.get(resolved);
  if (exists === undefined) {
    try {
      exists = statSync(resolved).isFile();
    } catch {
      exists = false;
    }
    if (existingProjectFiles.size < 2_000) existingProjectFiles.set(resolved, exists);
  }
  return exists ? nodePath.relative(root, resolved) : null;
}

export function safeErrorDiagnostics(
  error: unknown,
): { errorName: string; errorFrames: string[] } | null {
  if (error instanceof AppError) return null;
  if (!(error instanceof Error)) return { errorName: "NonError", errorFrames: [] };
  // Tanı hiçbir koşulda hata yanıtını bozmamalı: getter/toString fırlatabilir (Astra).
  try {
    return errorDiagnostics(error);
  } catch {
    return { errorName: "Error", errorFrames: [] };
  }
}

function errorDiagnostics(error: Error): { errorName: string; errorFrames: string[] } {
  const constructorName = error.constructor?.name ?? "";
  const errorName = knownErrorNames.has(constructorName)
    ? constructorName
    : knownErrorNames.has(error.name)
      ? error.name
      : "Error";
  /*
    Mesaj ile çerçevelerin ayrımı kanıtlanamaz: mesaj stack oluştuktan sonra
    değişebilir ve başlık kontrolünü atlatır (Astra, #183 3. tur). Bu yüzden satır
    ve sütun numarası HİÇ kaydedilmez — mesajdan sızabilecek tek içerik (sayılar)
    kanaldan çıkar. Kalan yalnız diskte var olan proje dosyalarının göreli yolları;
    art arda aynı dosya tek kez yazılır.
  */
  const stack = typeof error.stack === "string" ? error.stack : "";
  const errorFrames: string[] = [];
  for (const line of stack.slice(0, maxStackCharacters).split("\n", maxStackLines)) {
    const match = stackFrame.exec(line);
    if (!match) continue;
    const relative = projectRelativeFile(match[1] ?? "");
    if (!relative || errorFrames.at(-1) === relative) continue;
    errorFrames.push(relative);
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
