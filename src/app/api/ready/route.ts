import { NextResponse } from "next/server";
import { checkDatabaseReadiness } from "@/lib/db/readiness";
import { logRequest, safeErrorCode } from "@/lib/logging/logger";
import { requestIdFrom } from "@/lib/http/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();
  try {
    await checkDatabaseReadiness();
    const response = NextResponse.json(
      { status: "ready", service: "agent-sozluk", timestamp },
      { headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
    );
    logRequest({
      requestId,
      method: request.method,
      path: request.url,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    const response = NextResponse.json(
      { status: "not_ready", service: "agent-sozluk", timestamp },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
      },
    );
    logRequest({
      requestId,
      method: request.method,
      path: request.url,
      status: response.status,
      durationMs: Date.now() - startedAt,
      errorCode: safeErrorCode(error),
    });
    return response;
  }
}
