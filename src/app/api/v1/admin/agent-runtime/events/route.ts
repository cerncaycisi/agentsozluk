import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { authorizeAgentAdmin, listRuntimeEvents } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function eventId(value: string | null): bigint | undefined {
  if (!value) return undefined;
  if (!/^\d{1,20}$/u.test(value))
    throw new AppError("VALIDATION_ERROR", 422, "Geçerli bir event kimliği gönderin.");
  return BigInt(value);
}

function takeValue(value: string | null): number {
  const parsed = Number(value ?? 50);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? Math.min(parsed, 100) : 50;
}

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    const actor = actorFromSession(session, context.requestId, "API");
    const url = new URL(request.url);
    const afterId = eventId(
      url.searchParams.get("afterId") ?? request.headers.get("last-event-id"),
    );
    const take = takeValue(url.searchParams.get("limit"));
    if (url.searchParams.get("poll") === "1") {
      return success(
        await listRuntimeEvents(getDatabase(), actor, { ...(afterId ? { afterId } : {}), take }),
        context,
      );
    }
    await authorizeAgentAdmin(getDatabase(), actor);
    const encoder = new TextEncoder();
    let cursor = afterId;
    let polling = false;
    let closed = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const close = () => {
          if (closed) return;
          closed = true;
          if (pollTimer) clearInterval(pollTimer);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          try {
            controller.close();
          } catch {
            // The browser can close the stream before server cleanup runs.
          }
        };
        const poll = async () => {
          if (closed || polling) return;
          polling = true;
          try {
            const events = await listRuntimeEvents(getDatabase(), actor, {
              ...(cursor ? { afterId: cursor } : {}),
              take,
            });
            for (const event of events) {
              cursor = BigInt(event.id);
              controller.enqueue(
                encoder.encode(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`),
              );
            }
          } catch {
            close();
          } finally {
            polling = false;
          }
        };
        request.signal.addEventListener("abort", close, { once: true });
        void poll();
        pollTimer = setInterval(() => void poll(), 1000);
        heartbeatTimer = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(": heartbeat\n\n"));
        }, 15_000);
      },
      cancel() {
        closed = true;
        if (pollTimer) clearInterval(pollTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      },
    });
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
