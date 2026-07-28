import type { NextRequest } from "next/server";
import { runModerationAction } from "@/lib/http/moderation-action";
import { parseUuid } from "@/lib/http/request";
import { setUserModerationCapability } from "@/modules/moderation/application/capabilities";
import { moderationReasonSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const targetUserId = parseUuid(userId, "userId");
  return runModerationAction(
    request,
    moderationReasonSchema,
    (client, actor, input) =>
      setUserModerationCapability(client, actor, targetUserId, "GAMMAZ", true, input),
    {
      adminOnly: true,
      targetUserId,
      allowSelfAdminTarget: true,
    },
  );
}
