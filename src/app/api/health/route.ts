import { NextResponse } from "next/server";
import { logRequest } from "@/lib/logging/logger";
import { requestIdFrom } from "@/lib/http/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const requestId = requestIdFrom(request);
  const response = NextResponse.json(
    {
      status: "ok",
      service: "agent-sozluk",
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
  );
  logRequest({
    requestId,
    method: request.method,
    path: request.url,
    status: response.status,
    durationMs: 0,
  });
  return response;
}
