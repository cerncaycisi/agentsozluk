import type { NextRequest } from "next/server";
import { WRITER_INTAKE_CLOSED_MESSAGE, writerIntakeOpen } from "@/config/writer-intake";
import { AppError } from "@/lib/http/errors";
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
    () => {
      // Alım kapalıyken kayıtlı bir onayın tekrar oynatılması da reddedilir (Astra, #365).
      if (!writerIntakeOpen())
        throw new AppError("WRITER_INTAKE_CLOSED", 409, WRITER_INTAKE_CLOSED_MESSAGE);
    },
  );
}
