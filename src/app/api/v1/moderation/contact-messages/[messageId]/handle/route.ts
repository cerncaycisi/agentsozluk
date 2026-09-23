import type { NextRequest } from "next/server";
import { runModerationAction } from "@/lib/http/moderation-action";
import { parseUuid } from "@/lib/http/request";
import { resolveContactMessage } from "@/modules/contact/application/contact";
import { contactMessageHandleSchema } from "@/modules/contact/validation/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const id = parseUuid(messageId, "messageId");
  return runModerationAction(request, contactMessageHandleSchema, (client, actor, input) =>
    resolveContactMessage(client, actor, id, input),
  );
}
