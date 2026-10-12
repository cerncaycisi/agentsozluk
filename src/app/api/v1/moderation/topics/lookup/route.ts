import type { NextRequest } from "next/server";
import { requestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getModerationTopicTargets } from "@/modules/moderation/application/queries";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const session = await requestSession(request);
    const url = new URL(request.url);
    const topics = await getModerationTopicTargets(
      getDatabase(),
      actorFromSession(session, context.requestId, "API"),
      { query: url.searchParams.get("q") ?? "" },
    );
    return success(topics, context);
  });
}
