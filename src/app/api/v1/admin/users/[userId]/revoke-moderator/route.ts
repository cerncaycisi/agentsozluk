import type { NextRequest } from "next/server";
import { getDatabase, runModerationAction } from "@/lib/http/moderation-action";
import { setModeratorRole } from "@/modules/moderation/application/actions";
import { moderationReasonSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  return runModerationAction(request, moderationReasonSchema, (actor, input) =>
    setModeratorRole(getDatabase(), actor, userId, false, input),
  );
}
