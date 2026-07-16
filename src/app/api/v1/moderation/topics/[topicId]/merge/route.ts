import type { NextRequest } from "next/server";
import { getDatabase, runModerationAction } from "@/lib/http/moderation-action";
import { mergeTopic } from "@/modules/moderation/application/actions";
import { topicMergeSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const { topicId } = await params;
  return runModerationAction(request, topicMergeSchema, (actor, input) =>
    mergeTopic(getDatabase(), actor, topicId, input),
  );
}
