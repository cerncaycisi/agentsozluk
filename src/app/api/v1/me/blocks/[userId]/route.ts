import type { NextRequest } from "next/server";
import { activeCsrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { parseUuid } from "@/lib/http/request";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { deleteBlock, putBlock } from "@/modules/interactions/application/interactions";

export const runtime = "nodejs";

type Context = { params: Promise<{ userId: string }> };

export function PUT(request: NextRequest, { params }: Context) {
  return runApi(request, async (context) => {
    const { userId: rawUserId } = await params;
    const session = await activeCsrfSession(request);
    const result = await putBlock(
      getDatabase(),
      actorFromSession(session, context.requestId, "API"),
      parseUuid(rawUserId, "userId"),
    );
    return success(result, context);
  });
}

export function DELETE(request: NextRequest, { params }: Context) {
  return runApi(request, async (context) => {
    const { userId: rawUserId } = await params;
    const session = await activeCsrfSession(request);
    const result = await deleteBlock(
      getDatabase(),
      actorFromSession(session, context.requestId, "API"),
      parseUuid(rawUserId, "userId"),
    );
    return success(result, context);
  });
}
