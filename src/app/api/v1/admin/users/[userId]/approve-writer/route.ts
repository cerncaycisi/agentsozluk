import type { NextRequest } from "next/server";
import { runModerationAction } from "@/lib/http/moderation-action";
import { parseUuid } from "@/lib/http/request";
import { approveUserWriter } from "@/modules/moderation/application/actions";
import { moderationReasonSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  return runModerationAction(
    request,
    moderationReasonSchema,
    (client, actor, input) => approveUserWriter(client, actor, parseUuid(userId, "userId"), input),
    () => ({ adminOnly: true, targetUserId: parseUuid(userId, "userId") }),
  );
}
