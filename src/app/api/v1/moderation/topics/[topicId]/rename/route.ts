import type { NextRequest } from "next/server";
import { getDatabase, runModerationAction } from "@/lib/http/moderation-action";
import { renameTopic } from "@/modules/moderation/application/actions";
import { topicRenameSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const { topicId } = await params;
  return runModerationAction(request, topicRenameSchema, (actor, input) =>
    renameTopic(getDatabase(), actor, topicId, input),
  );
}
