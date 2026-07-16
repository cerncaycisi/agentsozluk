import type { NextRequest } from "next/server";
import { activeCsrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { parseUuid } from "@/lib/http/request";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { deleteFollow, putFollow } from "@/modules/interactions/application/interactions";

export const runtime = "nodejs";

type Context = { params: Promise<{ topicId: string }> };

export function PUT(request: NextRequest, { params }: Context) {
  return runApi(request, async (context) => {
    const { topicId: rawTopicId } = await params;
    const session = await activeCsrfSession(request);
    const result = await putFollow(
      getDatabase(),
      actorFromSession(session, context.requestId, "API"),
      parseUuid(rawTopicId, "topicId"),
    );
    return success(result, context);
  });
}

export function DELETE(request: NextRequest, { params }: Context) {
  return runApi(request, async (context) => {
    const { topicId: rawTopicId } = await params;
    const session = await activeCsrfSession(request);
    const result = await deleteFollow(
      getDatabase(),
      actorFromSession(session, context.requestId, "API"),
      parseUuid(rawTopicId, "topicId"),
    );
    return success(result, context);
  });
}
