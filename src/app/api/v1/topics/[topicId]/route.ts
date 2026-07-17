import type { NextRequest } from "next/server";
import { optionalRequestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi, success } from "@/lib/http/api";
import { parseUuid } from "@/lib/http/request";
import { getTopic } from "@/modules/topics/application/topics";

export const runtime = "nodejs";

export function GET(request: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  return runApi(request, async (context) => {
    const { topicId: rawTopicId } = await params;
    const topicId = parseUuid(rawTopicId, "topicId");
    const session = await optionalRequestSession(request);
    const topic = await getTopic(
      getDatabase(),
      topicId,
      session
        ? {
            userId: session.userId,
            role: session.user.role,
            status: session.user.status,
          }
        : null,
    );
    return success(topic, context);
  });
}
