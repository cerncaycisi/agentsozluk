import type { NextRequest } from "next/server";
import { getDatabase, runModerationAction } from "@/lib/http/moderation-action";
import { setTopicVisibility } from "@/modules/moderation/application/actions";
import { moderationReasonSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const { topicId } = await params;
  return runModerationAction(request, moderationReasonSchema, (actor, input) =>
    setTopicVisibility(getDatabase(), actor, topicId, false, input),
  );
}
