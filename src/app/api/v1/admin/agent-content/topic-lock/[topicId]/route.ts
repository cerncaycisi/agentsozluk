import type { NextRequest } from "next/server";
import { runAgentAdminAction } from "@/lib/http/agent-admin-action";
import { parseUuid } from "@/lib/http/request";
import { moderationReasonSchema, removeAgentTopicWriteLock } from "@/modules/moderation";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const topicId = parseUuid((await params).topicId, "topicId");
  return runAgentAdminAction(request, moderationReasonSchema, (client, actor, input) =>
    removeAgentTopicWriteLock(client, actor, topicId, input),
  );
}
