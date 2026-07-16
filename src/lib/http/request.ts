import { randomUUID } from "node:crypto";

export function requestIdFrom(request: Request): string {
  const candidate = request.headers.get("x-request-id");
  return candidate &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(candidate)
    ? candidate.toLowerCase()
    : randomUUID();
}
