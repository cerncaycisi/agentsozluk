import { AppError } from "@/lib/http/errors";

export const MAX_JSON_BODY_BYTES = 64 * 1024;

function payloadTooLarge(): AppError {
  return new AppError(
    "PAYLOAD_TOO_LARGE",
    413,
    `İstek gövdesi en fazla ${MAX_JSON_BODY_BYTES / 1024} KiB olabilir.`,
  );
}

function assertDeclaredLengthWithinLimit(request: Request): void {
  const contentLength = request.headers.get("content-length");
  if (contentLength === null || !/^\d+$/u.test(contentLength)) return;

  const declaredBytes = Number(contentLength);
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes > MAX_JSON_BODY_BYTES) {
    throw payloadTooLarge();
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  assertDeclaredLengthWithinLimit(request);

  if (!request.body) throw new SyntaxError("JSON body is empty.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value.byteLength > MAX_JSON_BODY_BYTES - totalBytes) {
        await reader.cancel().catch(() => undefined);
        throw payloadTooLarge();
      }
      totalBytes += value.byteLength;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown;
}
