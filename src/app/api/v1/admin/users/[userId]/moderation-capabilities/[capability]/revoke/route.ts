import type { NextRequest } from "next/server";
import { runModerationAction } from "@/lib/http/moderation-action";
import { parseUuid } from "@/lib/http/request";
import { AppError } from "@/lib/http/errors";
import { setUserModerationCapability } from "@/modules/moderation/application/capabilities";
import {
  MODERATION_CAPABILITIES,
  type ModerationCapabilityName,
} from "@/modules/moderation/domain/gammaz";
import { moderationReasonSchema } from "@/modules/moderation/validation/schemas";

export const runtime = "nodejs";

function parseCapability(value: string): ModerationCapabilityName {
  if (!MODERATION_CAPABILITIES.includes(value as ModerationCapabilityName))
    throw new AppError("VALIDATION_ERROR", 422, "Geçersiz moderasyon capability değeri.");
  return value as ModerationCapabilityName;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; capability: string }> },
) {
  const { userId, capability } = await params;
  const targetUserId = parseUuid(userId, "userId");
  const targetCapability = parseCapability(capability);
  return runModerationAction(
    request,
    moderationReasonSchema,
    (client, actor, input) =>
      setUserModerationCapability(client, actor, targetUserId, targetCapability, false, input),
    {
      adminOnly: true,
      targetUserId,
      allowSelfAdminTarget: true,
    },
  );
}
