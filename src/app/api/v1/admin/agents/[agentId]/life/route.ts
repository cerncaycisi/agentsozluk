import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { parseUuid } from "@/lib/http/request";
import { agentLifeQuerySchema, listAgentLifeEvents } from "@/modules/agents";
import { actorFromSession } from "@/modules/auth/domain/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const agentId = parseUuid((await params).agentId, "agentId");
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    const url = new URL(request.url);
    const input = agentLifeQuerySchema.parse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      eventType: url.searchParams.get("eventType") ?? undefined,
      runId: url.searchParams.get("runId") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      format: url.searchParams.get("format") ?? undefined,
    });
    const actor = actorFromSession(session, context.requestId, "API");
    if (input.format === "jsonl") {
      const database = getDatabase();
      const pageInput = (cursor?: string) => ({
        limit: 500,
        format: "json" as const,
        ...(cursor ? { cursor } : {}),
        ...(input.eventType ? { eventType: input.eventType } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.from ? { from: input.from } : {}),
        ...(input.to ? { to: input.to } : {}),
      });
      let cursor = input.cursor;
      let pendingPage = await listAgentLifeEvents(database, actor, agentId, pageInput(cursor));
      let finished = false;
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (finished) return;
          try {
            const page = pendingPage;
            pendingPage = { items: [], nextCursor: null };
            if (page.items.length > 0)
              controller.enqueue(
                encoder.encode(`${page.items.map((item) => JSON.stringify(item)).join("\n")}\n`),
              );
            if (!page.nextCursor) {
              finished = true;
              controller.close();
              return;
            }
            if (page.nextCursor === cursor) throw new Error("AGENT_LIFE_EXPORT_CURSOR_STALLED");
            cursor = page.nextCursor;
            pendingPage = await listAgentLifeEvents(database, actor, agentId, pageInput(cursor));
          } catch (error) {
            finished = true;
            controller.error(error);
          }
        },
        cancel() {
          finished = true;
        },
      });
      return new NextResponse(body, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Content-Disposition": `attachment; filename="agent-${agentId}-life.jsonl"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const page = await listAgentLifeEvents(getDatabase(), actor, agentId, input);
    return success(page, context);
  });
}
