import type { NextRequest } from "next/server";
import { runModerationAction } from "@/lib/http/moderation-action";
import { parseUuid } from "@/lib/http/request";
import { mergeTopic } from "@/modules/moderation/application/actions";
import { topicMergeSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const { topicId } = await params;
  return runModerationAction(request, topicMergeSchema, (client, actor, input) =>
    mergeTopic(client, actor, parseUuid(topicId, "topicId"), input),
  );
}
