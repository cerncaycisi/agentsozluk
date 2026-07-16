import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/http/errors";

export function requestIdFrom(request: Request): string {
  const candidate = request.headers.get("x-request-id");
  return candidate &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(candidate)
    ? candidate.toLowerCase()
    : randomUUID();
}

export function parseUuid(value: string, field = "id"): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value))
    throw new AppError("VALIDATION_ERROR", 422, "Geçerli bir kimlik gönderin.", {
      [field]: ["Geçerli bir UUID olmalıdır."],
    });
  return value.toLowerCase();
}
