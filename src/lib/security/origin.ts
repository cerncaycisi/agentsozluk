import { getEnvironment } from "@/config/env";
import { AppError } from "@/lib/http/errors";

export function assertValidOrigin(request: Request): void {
  const applicationUrl = new URL(getEnvironment().APP_URL);
  const origin = request.headers.get("origin");
  if (origin) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new AppError("ORIGIN_INVALID", 403, "İstek kaynağı doğrulanamadı.");
    }
    if (parsed.origin !== applicationUrl.origin) {
      throw new AppError("ORIGIN_INVALID", 403, "İstek kaynağı doğrulanamadı.");
    }
    return;
  }

  const host = request.headers.get("host");
  if (!host || host !== applicationUrl.host) {
    throw new AppError("ORIGIN_INVALID", 403, "İstek kaynağı doğrulanamadı.");
  }
}
